import { User } from '../models/user';

/**
 * Response interface for user information.
 *
 * Contains user information without password for security.
 * Used when returning user data to client.
 *
 * @category Responses
 * @since 1.0.0
 */
export type UserResponse = Omit<User, 'password' | 'uuid' | 'token'>;
