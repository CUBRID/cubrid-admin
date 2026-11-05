import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TestHostConnectionDto } from './host-request.dto';

const check = (body: object) => {
  const dto = plainToInstance(TestHostConnectionDto, body);
  // As the app's ValidationPipe does: fields the DTO does not declare are dropped.
  const errors = validateSync(dto, { whitelist: true }).map((e) => e.property);
  return { dto, errors };
};

describe('TestHostConnectionDto', () => {
  const settings = { address: '10.0.0.9', port: 8001, id: 'admin', password: 'pw' };

  it('takes the address, port, account and password and drops anything else', () => {
    const { dto, errors } = check({ ...settings, alias: 'web1', token: 'x' });
    expect(errors).toEqual([]);
    expect(dto).toEqual(settings);
  });

  it('rejects a blank address or account and a port out of range', () => {
    expect(check({ ...settings, address: '' }).errors).toEqual(['address']);
    expect(check({ ...settings, id: '' }).errors).toEqual(['id']);
    expect(check({ ...settings, port: 70000 }).errors).toEqual(['port']);
  });
});
