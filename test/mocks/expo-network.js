// Manual mock untuk 'expo-network', dipakai oleh queueService.isOnline().
// Default: selalu "online" kecuali test meng-override implementasinya
// langsung (jest.mocked / require('expo-network').getNetworkStateAsync).
module.exports = {
  __esModule: true,
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
};
