import axios from 'axios';
import { SUBSCRIPTION_CONSTANTS } from '../subscriptions/subscription.constants';

const ADMIN_API = SUBSCRIPTION_CONSTANTS.ADMIN_API_URL;

export const paymentClient = {
  async createOrder(payload: any) {
    const response = await axios.post(`${ADMIN_API}/api/payments/order`, payload);
    return response.data;
  },

  async verifyPayment(payload: any) {
    const response = await axios.post(`${ADMIN_API}/api/payments/verify`, payload);
    return response.data;
  }
};
