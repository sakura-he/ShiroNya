//https://docs.nestjs.com/recipes/swc#monorepo-and-cli-plugins
import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator';
import { ReadonlyVisitor } from '@nestjs/swagger/plugin';

const generator = new PluginMetadataGenerator();
generator.generate({
    visitors: [new ReadonlyVisitor({ introspectComments: true, pathToSource: import.meta.dirname })],
    outputDir: import.meta.dirname,
    watch: true,
    tsconfigPath: 'apps/app-api/tsconfig.app.json'
});
