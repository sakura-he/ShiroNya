<template>
    <div class="content">
        <a-result
            class="result"
            status="404"
            :subtitle="'页面找不到'"
        ></a-result>
        <div class="operation-row">
            <a-button
                key="back"
                type="primary"
                @click="back"
                size="large"
            >
                返回
            </a-button>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { NOT_FOUND } from "@/router/routes/constant";
    import { useRouter } from "vue-router";
    defineOptions({
        name: NOT_FOUND,
    });
    const router = useRouter();
    const back = () => {
        // warning： Go to the node that has the permission
        router.push("/");
    };
</script>

<style scoped lang="scss">
    .content {
        // padding-top: 100px;
        position: absolute;
        top: 50%;
        left: 50%;
        margin-left: -95px;
        margin-top: -121px;
        text-align: center;
    }
</style>
