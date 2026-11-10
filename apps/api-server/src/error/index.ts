// Base error class
export * from './error-kind';
export * from './client-error-messages';
export * from './app-error';
export * from './failure-details';

// Domain-specific errors
export * from './host/host-error';
export * from './storage/storage-error';
export * from './lock/lock-error';
export * from './user/user-error';
export * from './database/database-error';
export * from './broker/broker-error';
export * from './auth/auth-error';
export * from './cms/cms-error';
export * from './cms/cms-error-code';
export * from './validation/validation-error';
export * from './validation/create-validation-pipe';
export * from './monitoring/resource-monitoring-error';
export * from './monitoring/resource-monitoring-error-code';
export * from './config';

// Global error handling
export * from './global-filter';
