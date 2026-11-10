import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { createValidationPipe } from './create-validation-pipe';
import { ValidationError } from './validation-error';

class PortBody {
  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;
}

describe('createValidationPipe', () => {
  it('names each invalid field and the checks it failed, besides the English messages', async () => {
    const pipe = createValidationPipe();

    const thrown = await pipe
      .transform({ address: '', port: 70000 }, { type: 'body', metatype: PortBody })
      .catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(ValidationError);
    const data = (thrown as ValidationError).toProblemDetails();
    expect(data.type).toBe('/errors/validation/invalid_request_body');
    expect(data).toMatchObject({
      invalidFields: [
        { field: 'address', constraints: ['isNotEmpty'] },
        { field: 'port', constraints: ['max'] },
      ],
    });
    expect(data.detail).toContain('port must not be greater than 65535');
  });
});
