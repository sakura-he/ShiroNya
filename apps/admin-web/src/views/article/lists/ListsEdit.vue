<template>
    <GiPageLayout>
        <a-space
            direction="vertical"
            :style="{ width: '100%' }"
        >
            <a-upload
                :ref="uploadRef"
                :multiple="false"
                @change="handleChange"
                :limit="1"
                :custom-request="customRequest"
            />
        </a-space>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import { request } from "@/api";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import type { FileItem, RequestOption } from "@arco-design/web-vue";
    import * as SparkMD5 from "spark-md5";
    defineOptions({
        name: "ListsEdit",
    });
    let uploadRef = ref<any>(null);
    function handleChange(file: any) {
        console.log(file);
    }
    const chunkSize = 1 * 1024 * 1024; // 1MB
    interface IChunks {
        chunk: Blob;
        chunk_hash: string;
        index: number;
    }
    // 将文件进行切片
    function fileSlice(file: File, onProgress: (progress: number) => any) {
        let currentChunkSize = 0;
        let currentChunkIndex = 0;
        let chunks: Array<IChunks> = [];
        const MaxProgress = 5;
        while (currentChunkSize < file.size) {
            chunks.push({
                chunk: file.slice(currentChunkSize, currentChunkSize + chunkSize),
                index: currentChunkIndex,
                chunk_hash: "",
            });
            currentChunkSize += chunkSize;
            currentChunkIndex++;
        }
        onProgress(MaxProgress);

        return { chunks, chunkLength: currentChunkIndex };
    }
    // 计算文件的 md5
    async function computeMD5(chunks: Array<IChunks>, onProgress: (progress: number) => any) {
        const spark = new SparkMD5.ArrayBuffer();
        for await (const chunk of chunks) {
            let arrayBuffer = await chunk.chunk.arrayBuffer();
            // 计算切片的hash, 用以断点续传
            let sparkChunk = new SparkMD5.ArrayBuffer();
            sparkChunk.append(arrayBuffer);
            chunk.chunk_hash = sparkChunk.end();
            // 追加文件切片计算 文件 hash
            spark.append(arrayBuffer);
        }
        let fileHash = spark.end();
        onProgress(5);
        spark.destroy(); // 释放 spark
        return fileHash;
    }
    // 生成 提交时的formData
    function createFormData(
        chunks: Array<IChunks>,
        fileItem: Required<FileItem>,
        fileHash: string,
        fileChunksLength: number,
    ) {
        return chunks.map((chunk: IChunks, index) => {
            const formData = new FormData();
            // 文件信息
            formData.append("file_name", fileItem.name as string);
            formData.append("file_hash", fileHash);
            formData.append("file_uid", fileItem.uid);
            formData.append("file_size", fileItem.file.size.toString());
            formData.append("file_type", fileItem.file.type as string);
            formData.append("chunk_hash", chunk.chunk_hash);
            formData.append("chunk_index", chunk.index.toString());
            formData.append("file_chunks_length", fileChunksLength.toString());
            // 后端接收 'chunk' 字段的文件
            formData.append("chunk", chunk.chunk);
            return formData;
        });
    }
    // 上传切片
    function uploadChunks(formDatas: Array<FormData>, onProgress: (progress: number) => any) {
        return new Promise((resolve, reject) => {
            let maxUploadLimit = 3;
            let currentChunkCount = 0;
            let TotalChunkCount = formDatas.length;
            async function startUpload() {
                let formData = formDatas.shift();
                if (!formData) {
                    return;
                }
                await request.post("http://localhost:3000/common/upload_chunk", formData);
                // 更新进度
                currentChunkCount++;
                onProgress(Math.round((currentChunkCount / TotalChunkCount) * 99));
                console.log(Math.round((currentChunkCount / TotalChunkCount) * 99));
                // 如果当前 chunk index 是
                if (currentChunkCount === TotalChunkCount) {
                    onProgress(99);
                    resolve(currentChunkCount);
                    return;
                }
                // 当前chunk 上传完成,立即开启一个新的上传
                startUpload();
            }
            // 并行开启 limit 个chunk 上传任务
            for (let i = 1; i <= maxUploadLimit; i++) {
                startUpload();
            }
        });
    }
    // 自定义上传请求
    const customRequest = (option: RequestOption) => {
        const { onProgress, onError, onSuccess, fileItem, name } = option;
        if (!fileItem.file) {
            onError("文件不存在");
            return { abort: () => {} };
        }
        let chunks = fileSlice(fileItem.file, onProgress);
        computeMD5(chunks.chunks, onProgress)
            .then((fileHash) => {
                let formData = createFormData(
                    chunks.chunks,
                    fileItem as Required<FileItem>,
                    fileHash,
                    chunks.chunkLength,
                );
                return formData;
            })
            .then((formDatas) => {
                console.log("formDatas", formDatas);
                return uploadChunks(formDatas, onProgress);
            })
            .then((res) => {
                // 所有切片上传完成
                console.log("res", res);

                onSuccess(res);
            })
            .catch((err) => {
                console.log("err", err);
                onError(err);
            });

        return {
            abort: () => {},
        };
    };
</script>

<style scoped></style>
