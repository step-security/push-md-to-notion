import axios from 'axios';
import axiosRetry from 'axios-retry';

const httpClient = axios.create({
  baseURL: 'https://api.notion.com/v1',
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add retry logic
axiosRetry(httpClient, {
  retries: 3, // Number of retry attempts
  retryDelay: axiosRetry.exponentialDelay,
});

export default httpClient;
