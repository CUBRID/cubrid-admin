/**
 * A method decorator that wraps authentication methods in a try...catch block.
 *
 * Errors are passed through as-is. System/library level errors are already
 * converted to AppError by lower-level decorators.
 *
 * @category Decorators
 * @since 1.0.0
 */
export function HandleAuthErrors() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      return await originalMethod.apply(this, args);
    };
  };
}
