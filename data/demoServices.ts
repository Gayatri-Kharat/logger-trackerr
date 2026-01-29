
import type { Service } from '../types';

export const DEMO_SERVICES: Service[] = [
  { id: 'productorder-returnnotecust-service', name: 'productorder-returnnotecust', defaultLevel: 'ERROR' },
  { id: 'order-api', name: 'Order Processing API', defaultLevel: 'ERROR' },
  { id: 'payment-gw', name: 'Payment Gateway', defaultLevel: 'ERROR' },
  { id: 'inventory-svc', name: 'Inventory Manager', defaultLevel: 'ERROR' },
  { id: 'notif-svc', name: 'Notification Service', defaultLevel: 'ERROR' },
  { id: 'cart-svc', name: 'Shopping Cart Service', defaultLevel: 'ERROR' },
  { id: 'search-idx', name: 'Search Indexer', defaultLevel: 'WARN' },
  { id: 'rec-engine', name: 'Recommendation Engine', defaultLevel: 'INFO' },
  { id: 'shipping-logistics', name: 'Logistics Coordinator', defaultLevel: 'INFO' },
  { id: 'user-profile', name: 'User Profile Service', defaultLevel: 'DEBUG' },
  { id: 'audit-trail', name: 'Audit Logging Service', defaultLevel: 'TRACE' }
];
