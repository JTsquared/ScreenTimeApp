import apiClient from './client';

export const allowanceAPI = {
  // Get balance
  getBalance: async (childId = null) => {
    const url = childId ? `/allowance/balance/${childId}` : '/allowance/balance';
    const response = await apiClient.get(url);
    return response.data;
  },

  // Get transactions
  getTransactions: async (childId = null) => {
    const url = childId ? `/allowance/transactions/${childId}` : '/allowance/transactions';
    const response = await apiClient.get(url);
    return response.data;
  },

  // Record payout (parents only)
  recordPayout: async (childId, amount, notes = '') => {
    const response = await apiClient.post('/allowance/payout', {
      childId,
      amount,
      notes,
    });
    return response.data;
  },

  // Get all balances (parents only)
  getAllBalances: async () => {
    const response = await apiClient.get('/allowance/all-balances');
    return response.data;
  },

  // Update allowance rate (parents only)
  updateAllowanceRate: async (childId, allowanceRate) => {
    const response = await apiClient.put('/allowance/rate', {
      childId,
      allowanceRate,
    });
    return response.data;
  },

  // Deposit to savings
  depositSavings: async (amount) => {
    const response = await apiClient.post('/allowance/deposit-savings', { amount });
    return response.data;
  },

  // Request withdrawal from savings
  requestWithdrawal: async (amount, notes = '') => {
    const response = await apiClient.post('/allowance/request-withdrawal', { amount, notes });
    return response.data;
  },

  // Request to spend
  requestSpend: async (amount, notes = '') => {
    const response = await apiClient.post('/allowance/request-spend', { amount, notes });
    return response.data;
  },

  // Approve request (parents only)
  approveRequest: async (id) => {
    const response = await apiClient.post(`/allowance/approve-request/${id}`);
    return response.data;
  },

  // Quick approve from child's device using parent credentials
  quickApproveRequest: async (id, parentLogin, parentPassword) => {
    const response = await apiClient.post(`/allowance/quick-approve-request/${id}`, {
      parentLogin,
      parentPassword,
    });
    return response.data;
  },

  // Reject request (parents only)
  rejectRequest: async (id) => {
    const response = await apiClient.post(`/allowance/reject-request/${id}`);
    return response.data;
  },

  // Get pending requests
  getPendingRequests: async () => {
    const response = await apiClient.get('/allowance/pending-requests');
    return response.data;
  },
};
