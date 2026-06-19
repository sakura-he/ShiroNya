<template>
    <div class="container">
        <div class="tw:fixed tw:z-40 tw:top-5 tw:left-5">
            <ColorModeSwitch
                v-slot="icon"
                ref="ColorModeSwitchRef"
            >
                <a-button shape="circle">
                    <DynamicIcon
                        :icon="icon.icon"
                        class="tw:text-title-1"
                    />
                </a-button>
            </ColorModeSwitch>
        </div>
        <div class="banner">
            <a-carousel
                class="swiper"
                :default-current="2"
                indicator-type="slider"
                :auto-play="true"
                :show-arrow="'never'"
            >
                <a-carousel-item
                    v-for="image in images"
                    :key="image"
                    class="swiper__item"
                >
                    <img
                        :src="image"
                        :style="{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }"
                    />
                </a-carousel-item>
            </a-carousel>
        </div>
        <div class="content">
            <div
                class="form tw:w-11/12 tw:pointer-events-auto tw:mx-auto tw:sm:max-w-[340px] tw:py-10 tw:px-6 tw:box-border tw:bg-fill-transparent-4 tw:rounded-sm tw:backdrop-blur-[50px] tw:md:mr-[10%]"
            >
                <div class="tw:mb-4">
                    <div class="logo">
                        <img
                            class="logo_img"
                            src="@/assets/logo2.svg"
                            alt=""
                        />
                    </div>

                    <div
                        class="login__sub-title tw:text-c-2 tw:text-title-3 tw:font-bold tw:text-center tw:leading-tight tw:select-none tw:pb-2"
                    >
                        ShiroNya
                    </div>
                    <div class="tw:text-center tw:text-c-3 tw:text-body-3">
                        {{ loginMethodSubtitle }}
                    </div>
                </div>

                <form-create
                    :model-value="form"
                    v-model:api="loginFormApi"
                    :rule="loginFormRules"
                    :option="loginFormOptions"
                    class="login__form"
                    @update:model-value="syncLoginForm"
                />

                <div class="login-actions">
                    <a-button
                        type="text"
                        size="mini"
                        @click="onForgotPassword"
                    >
                        忘记密码
                    </a-button>
                    <a-divider
                        class="login-actions__divider"
                        direction="vertical"
                    />
                    <a-button
                        type="text"
                        size="mini"
                        @click="onRegister"
                    >
                        注册账号
                    </a-button>
                </div>

                <div class="login-mode-switch">
                    <a-tooltip :content="loginMethodToggleTip">
                        <a-button
                            class="login-mode-switch__button"
                            type="outline"
                            shape="circle"
                            @click="toggleLoginMethod"
                        >
                            <DynamicIcon
                                :icon="loginMethodToggleIcon"
                                class="tw:text-title-3"
                            />
                        </a-button>
                    </a-tooltip>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts" setup>
    import type { LoginMethod } from "@/api/schemas/account.schema";
    import login1 from "@/assets/login1.jpg";
    import login2 from "@/assets/login2.jpg";
    import login3 from "@/assets/login3.jpg";
    import DynamicIcon from "@/components/DynamicIcon.vue";
    import ColorModeSwitch from "@/layout/components/ColorModeSwitch.vue";
    import { HOME } from "@/router/routes/constant";
    import { useUserStore } from "@/store";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import useLoading from "@/utils/useLoading";
    import { Message } from "@arco-design/web-vue";
    import {
        computed,
        defineComponent,
        h,
        markRaw,
        ref,
        resolveComponent,
        shallowRef,
        type PropType,
    } from "vue";
    import { useRoute, useRouter } from "vue-router";

    defineOptions({
        name: "Login",
    });

    const userStore = useUserStore();
    const router = useRouter();
    const route = useRoute();
    const { loading, setLoading } = useLoading(false);
    const images = [login1, login2, login3];
    const loginFormApi = shallowRef<FormCreateApi | null>(null);
    const loginMethod = ref<LoginMethod>("account-password");
    const authIntent = ref<"login" | "register">("login");
    const codeSending = ref(false);
    const PHONE_PATTERN = /^1[3-9]\d{9}$/;
    const loginMethodOrder: LoginMethod[] = ["account-password", "phone-password", "phone-code"];
    const loginMethodLabel: Record<LoginMethod, string> = {
        "account-password": "账号密码登录",
        "phone-password": "手机号密码登录",
        "phone-code": "手机号验证码登录",
    };
    type FocusableInput = {
        focus(): void;
    };
    const passwordInputRef = shallowRef<FocusableInput | null>(null);
    const codeInputRef = shallowRef<FocusableInput | null>(null);
    const form = reactive({
        account: "",
        phoneNumber: "",
        password: "",
        code: "",
        rememberMe: false,
    });
    const isPhoneMode = computed(() => loginMethod.value !== "account-password");
    const isCodeMode = computed(() => loginMethod.value === "phone-code");
    const loginMethodMeta = computed(() => {
        if (loginMethod.value === "phone-code") {
            return {
                field: "phoneNumber",
                title: "手机号",
                placeholder: "请输入手机号",
                icon: "icon-mobile" as const,
                subtitle:
                    authIntent.value === "register"
                        ? "使用手机号验证码注册后台账号"
                        : "使用手机号验证码登录管理后台",
                emptyMessage: "请输入手机号",
            };
        }

        return loginMethod.value === "phone-password"
            ? {
                  field: "phoneNumber",
                  title: "手机号",
                  placeholder: "请输入手机号",
                  icon: "icon-mobile" as const,
                  subtitle: "使用手机号和密码登录管理后台",
                  emptyMessage: "请输入手机号",
              }
            : {
                  field: "account",
                  title: "账号",
                  placeholder: "请输入账号",
                  icon: "icon-user" as const,
                  subtitle: "使用账号和密码登录管理后台",
                  emptyMessage: "请输入账号",
              };
    });
    const loginMethodSubtitle = computed(() => loginMethodMeta.value.subtitle);
    const loginSubmitText = computed(() =>
        authIntent.value === "register" && isCodeMode.value ? "注册并登录" : "登录",
    );
    const nextLoginMethod = computed(() => {
        const currentIndex = loginMethodOrder.indexOf(loginMethod.value);
        return loginMethodOrder[(currentIndex + 1) % loginMethodOrder.length];
    });
    const loginMethodToggleTip = computed(() => `切换为${loginMethodLabel[nextLoginMethod.value]}`);
    const loginMethodToggleIcon = computed(() => "icon-swap");
    const LoginTextInput = defineComponent({
        name: "LoginTextInput",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: String,
                default: "",
            },
            placeholder: {
                type: String,
                default: "",
            },
            password: {
                type: Boolean,
                default: false,
            },
            icon: {
                type: String as PropType<"icon-user" | "icon-mobile" | "icon-lock">,
                default: "icon-user",
            },
        },
        emits: ["update:modelValue"],
        setup(props, { attrs, emit }) {
            const TextInput = resolveComponent("a-input");
            const PasswordInput = resolveComponent("a-input-password");
            return () => {
                const Input = props.password ? PasswordInput : TextInput;
                return h(
                    Input,
                    {
                        ...attrs,
                        ...(props.password ? { ref: passwordInputRef } : {}),
                        "modelValue": props.modelValue,
                        "placeholder": props.placeholder,
                        "onUpdate:modelValue": (value: string) => emit("update:modelValue", value),
                    },
                    {
                        prefix: () => h(resolveComponent(props.icon)),
                    },
                );
            };
        },
    });
    const LoginCodeInput = defineComponent({
        name: "LoginCodeInput",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: String,
                default: "",
            },
            placeholder: {
                type: String,
                default: "",
            },
            sendLoading: {
                type: Boolean,
                default: false,
            },
        },
        emits: ["update:modelValue", "sendCode"],
        setup(props, { attrs, emit }) {
            const TextInput = resolveComponent("a-input");
            const Button = resolveComponent("a-button");
            return () =>
                h(
                    TextInput,
                    {
                        ...attrs,
                        "ref": codeInputRef,
                        "modelValue": props.modelValue,
                        "placeholder": props.placeholder,
                        "onUpdate:modelValue": (value: string) => emit("update:modelValue", value),
                    },
                    {
                        prefix: () => h(resolveComponent("icon-safe")),
                        suffix: () =>
                            h(
                                Button,
                                {
                                    type: "text",
                                    size: "mini",
                                    loading: props.sendLoading,
                                    onClick: (event: Event) => {
                                        event.stopPropagation();
                                        emit("sendCode");
                                    },
                                },
                                () => "获取验证码",
                            ),
                    },
                );
        },
    });
    const loginTextInputComponent = markRaw(LoginTextInput);
    const loginCodeInputComponent = markRaw(LoginCodeInput);
    const loginFormRules = computed<FormCreateRule[]>(() => {
        const accountValidators = [
            { required: true, message: loginMethodMeta.value.emptyMessage, trigger: "change" },
        ];
        if (isPhoneMode.value) {
            accountValidators.push({
                pattern: PHONE_PATTERN,
                message: "请输入有效手机号",
                trigger: "change",
            } as any);
        }

        const rules: FormCreateRule[] = [
            {
                field: loginMethodMeta.value.field,
                title: loginMethodMeta.value.title,
                type: "loginTextInput",
                component: loginTextInputComponent,
                props: {
                    placeholder: loginMethodMeta.value.placeholder,
                    icon: loginMethodMeta.value.icon,
                    onPressEnter: focusPasswordInput,
                },
                validate: accountValidators,
            },
        ];

        if (isCodeMode.value) {
            rules.push({
                field: "code",
                title: "验证码",
                type: "loginCodeInput",
                component: loginCodeInputComponent,
                props: {
                    placeholder: "请输入验证码",
                    sendLoading: codeSending.value,
                    onPressEnter: onLogin,
                    onSendCode: onSendPhoneCode,
                },
                validate: [{ required: true, message: "请输入验证码", trigger: "change" }],
            });
        } else {
            rules.push({
                field: "password",
                title: "密码",
                type: "loginPasswordInput",
                component: loginTextInputComponent,
                props: {
                    placeholder: "请输入密码",
                    password: true,
                    icon: "icon-lock",
                    onPressEnter: onLogin,
                },
                validate: [{ required: true, message: "请输入密码", trigger: "change" }],
            });
        }

        rules.push({
            field: "rememberMe",
            type: "a-checkbox",
            children: ["记住登录状态"],
        });
        return rules;
    });
    const loginFormOptions = computed<FormCreateOptions>(() => ({
        form: {
            layout: "vertical",
        },
        row: {
            gutter: 12,
        },
        // 登录表单是窄卡片布局，不使用插件级响应式列宽，固定一行一个表单项。
        col: { span: 24 },
        submitBtn: {
            show: true,
            long: true,
            type: "primary",
            loading: loading.value,
            innerText: loginSubmitText.value,
            click: onLogin,
        },
        resetBtn: false,
    }));

    function syncLoginForm(value: Partial<typeof form>) {
        Object.assign(form, value);
    }

    function focusPasswordInput() {
        if (isCodeMode.value) {
            codeInputRef.value?.focus();
            return;
        }
        passwordInputRef.value?.focus();
    }

    function clearLoginValidateState() {
        (
            loginFormApi.value as
                | (FormCreateApi & { clearValidate?: (fields?: string | string[]) => void })
                | null
        )?.clearValidate?.(["account", "phoneNumber", "password", "code"]);
    }

    function toggleLoginMethod() {
        loginMethod.value = nextLoginMethod.value;
        authIntent.value = "login";
        clearLoginValidateState();
    }

    function enterPhoneCodeMode(intent: "login" | "register") {
        loginMethod.value = "phone-code";
        authIntent.value = intent;
        clearLoginValidateState();
    }

    function onForgotPassword() {
        enterPhoneCodeMode("login");
        Message.info("请使用手机号验证码登录后修改密码");
    }

    function onRegister() {
        enterPhoneCodeMode("register");
        Message.info("请输入手机号并获取验证码完成注册");
    }

    async function onSendPhoneCode() {
        if (codeSending.value) {
            return;
        }

        const phoneNumber = form.phoneNumber.trim();
        if (!PHONE_PATTERN.test(phoneNumber)) {
            Message.warning("请输入有效手机号后获取验证码");
            return;
        }

        codeSending.value = true;
        try {
            await userStore.sendPhoneLoginCode(phoneNumber);
            Message.success("验证码已发送");
        } catch (error: any) {
            Message.error(error?.message || "验证码发送失败");
        } finally {
            codeSending.value = false;
        }
    }

    function buildLoginPayload() {
        if (loginMethod.value === "phone-code") {
            return {
                loginMethod: loginMethod.value,
                phoneNumber: form.phoneNumber.trim(),
                code: form.code.trim(),
                rememberMe: form.rememberMe,
            };
        }

        if (loginMethod.value === "phone-password") {
            return {
                loginMethod: loginMethod.value,
                phoneNumber: form.phoneNumber.trim(),
                password: form.password,
                rememberMe: form.rememberMe,
            };
        }

        return {
            loginMethod: loginMethod.value,
            account: form.account.trim(),
            password: form.password,
            rememberMe: form.rememberMe,
        };
    }

    /**
     * 提交 Better Auth 账号密码、手机号密码或手机号验证码登录，并在成功后恢复业务态首页。
     */
    async function onLogin() {
        if (loading.value) {
            return;
        }

        try {
            await loginFormApi.value?.validate();
        } catch {
            return;
        }

        setLoading(true);

        try {
            await userStore.login(buildLoginPayload());

            if (route.query.toUrl) {
                Message.success(
                    authIntent.value === "register"
                        ? "注册成功，正在返回之前的页面"
                        : "登录成功，正在返回之前的页面",
                );
                await router.replace({
                    path: String(route.query.toUrl),
                });
                return;
            }

            Message.success(authIntent.value === "register" ? "注册成功，欢迎使用" : "欢迎使用");
            await router.replace({
                name: HOME,
                replace: true,
            });
        } catch (error: any) {
            Message.error(error?.message || "登录失败");
        } finally {
            setLoading(false);
        }
    }
</script>
<style lang="scss" scoped>
    .logo {
        width: 100%;
        height: 80px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: center;

        .logo_img {
            height: 100%;
            object-fit: contain;
        }
    }

    .container {
        width: 100%;
        height: 100%;
        display: flex;
        position: relative;
    }

    .banner {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2;
        background-color: #f3f5f8;
    }

    .content {
        position: relative;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 3;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }

    .swiper {
        height: 100%;

        .siwper__item {
            height: 100%;
        }
    }

    .login-actions {
        min-height: 28px;
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
    }

    .login-actions__divider {
        height: 14px;
        margin: 0 2px;
    }

    .login-mode-switch {
        margin-top: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .login-mode-switch__button {
        background: transparent;
        border-color: var(--color-border-3);
    }
</style>
