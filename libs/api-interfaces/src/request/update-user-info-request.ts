import { User } from '../models/user';

/**
 * Request interface for updating user information.
 *
 * Currently allows updating the 'department' field of a user.
 *
 * @category Requests
 * @since 1.0.0
 */
export type UpdateUserInfoRequest = Pick<User, 'department'>;
