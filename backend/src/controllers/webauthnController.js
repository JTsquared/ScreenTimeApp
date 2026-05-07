const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const RP_NAME = 'ScreenTime Manager';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'screentime.bubbledegen.xyz';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'https://screentime.bubbledegen.xyz';

// Generate JWT token (same helper as authController)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// In-memory challenge store (keyed by userId or login)
// In production, use Redis or DB. For this family app, in-memory is fine.
const challengeStore = new Map();

/**
 * POST /api/webauthn/register-options
 * Generates registration options for the authenticated user.
 * Requires auth (protect middleware).
 */
exports.registerOptions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email || user.username,
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: [],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'discouraged',
        requireResidentKey: false,
        userVerification: 'required',
      },
    });

    // Store challenge for verification
    challengeStore.set(user._id.toString(), options.challenge);

    // Clean up old challenges after 5 minutes
    setTimeout(() => {
      challengeStore.delete(user._id.toString());
    }, 5 * 60 * 1000);

    res.json(options);
  } catch (error) {
    console.error('WebAuthn register-options error:', error);
    res.status(500).json({ message: 'Failed to generate registration options', error: error.message });
  }
};

/**
 * POST /api/webauthn/register-verify
 * Verifies registration response, saves credential to user.
 * Requires auth (protect middleware).
 */
exports.registerVerify = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const expectedChallenge = challengeStore.get(user._id.toString());
    if (!expectedChallenge) {
      return res.status(400).json({ message: 'No registration challenge found. Please try again.' });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ message: 'Registration verification failed' });
    }

    const { credential } = verification.registrationInfo;

    // Store the credential
    const newCredential = {
      credentialID: credential.id,
      credentialPublicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      transports: req.body.response?.transports || [],
    };

    user.webauthnCredentials = user.webauthnCredentials || [];
    user.webauthnCredentials.push(newCredential);
    await user.save();

    // Clean up challenge
    challengeStore.delete(user._id.toString());

    res.json({ verified: true, message: 'WebAuthn credential registered successfully' });
  } catch (error) {
    console.error('WebAuthn register-verify error:', error);
    res.status(500).json({ message: 'Registration verification failed', error: error.message });
  }
};

/**
 * POST /api/webauthn/auth-options
 * Generates authentication options for a given user (by email/username in body).
 * Public endpoint (no auth needed).
 */
exports.authOptions = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email or username is required' });
    }

    const login = email.toLowerCase().trim();
    const user = await User.findOne({ email: login }) || await User.findOne({ username: login });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.webauthnCredentials || user.webauthnCredentials.length === 0) {
      return res.status(400).json({ message: 'No WebAuthn credentials registered for this user' });
    }

    const allowCredentials = user.webauthnCredentials.map((cred) => ({
      id: cred.credentialID,
      transports: cred.transports,
    }));

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'required',
    });

    // Store challenge keyed by login
    challengeStore.set(`auth_${login}`, {
      challenge: options.challenge,
      userId: user._id.toString(),
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      challengeStore.delete(`auth_${login}`);
    }, 5 * 60 * 1000);

    res.json(options);
  } catch (error) {
    console.error('WebAuthn auth-options error:', error);
    res.status(500).json({ message: 'Failed to generate authentication options', error: error.message });
  }
};

/**
 * POST /api/webauthn/auth-verify
 * Verifies authentication response. Returns user data + JWT token if successful.
 * Public endpoint (no auth needed).
 */
exports.authVerify = async (req, res) => {
  try {
    const { email, authResponse } = req.body;
    if (!email || !authResponse) {
      return res.status(400).json({ message: 'Email and authResponse are required' });
    }

    const login = email.toLowerCase().trim();
    const stored = challengeStore.get(`auth_${login}`);
    if (!stored) {
      return res.status(400).json({ message: 'No authentication challenge found. Please try again.' });
    }

    const user = await User.findById(stored.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the matching credential
    const credentialID = authResponse.id;
    const matchingCred = user.webauthnCredentials.find(
      (cred) => cred.credentialID === credentialID
    );

    if (!matchingCred) {
      return res.status(400).json({ message: 'Credential not found' });
    }

    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: matchingCred.credentialID,
        publicKey: new Uint8Array(Buffer.from(matchingCred.credentialPublicKey, 'base64')),
        counter: matchingCred.counter,
        transports: matchingCred.transports,
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ message: 'Authentication verification failed' });
    }

    // Update counter
    matchingCred.counter = verification.authenticationInfo.newCounter;
    await user.save();

    // Clean up challenge
    challengeStore.delete(`auth_${login}`);

    // Return user data + token (same format as authController.login)
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      familyId: user.familyId,
      allowanceRate: user.allowanceRate,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('WebAuthn auth-verify error:', error);
    res.status(500).json({ message: 'Authentication verification failed', error: error.message });
  }
};
