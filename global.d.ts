declare const __FILE_PATH__: string;

declare module "kafkajs-snappy" {
	type KafkaJsSnappyCodec = {
		compress(encoder: { buffer: Buffer }): Promise<Buffer>;
		decompress(buffer: Buffer): Promise<Buffer>;
	};

	const createSnappyCodec: () => KafkaJsSnappyCodec;

	export default createSnappyCodec;
}

declare module "@arco-design/color" {
	export function generate(
		color: string,
		options?: {
			index?: number;
			dark?: boolean;
			list?: boolean;
			format?: "hex" | "rgb" | "hsl";
		},
	): string | string[];

	export function getRgbStr(color: string): string;
}
