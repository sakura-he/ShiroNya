import { SetMetadata } from '@nestjs/common';
import { PUBLIC_KEY } from '../constants/auth.constant';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
