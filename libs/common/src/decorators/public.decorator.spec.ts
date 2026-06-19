import { PUBLIC_KEY } from '../constants/auth.constant';
import { Public } from './public.decorator';

describe('Public decorator', () => {
    it('should mark route as public', () => {
        class DemoController {
            @Public()
            handler() {
                return 'ok';
            }
        }

        const handler = DemoController.prototype.handler;

        expect(Reflect.getMetadata(PUBLIC_KEY, handler)).toBe(true);
    });
});
