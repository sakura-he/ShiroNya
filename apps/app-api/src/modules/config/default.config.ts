import { registerAs } from '@nestjs/config';

let aa = registerAs('default', () => ({
    test: process.env['ENV_TEST'],
    testport: process.env['ENV_TESTPORT'],
    testdatabase: process.env['ENV_TESTDATABASE']
}));

export default aa;
