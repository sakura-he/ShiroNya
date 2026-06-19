import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
export const SplitAudioSchema = z.object({
    labelJsonPath: z.string(),
    audioFilePath: z.string(),
    outputDir: z.string()
});
export class SplitAudioDto extends createZodDto(SplitAudioSchema) {}
