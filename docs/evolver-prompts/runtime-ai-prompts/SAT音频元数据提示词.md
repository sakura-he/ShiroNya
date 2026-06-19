# SAT 音频 Metadata Prompt

适用范围：SAT 音频切片、标注聚合、metadata TXT 写出。

本文件记录代码中名为 `prompt` 的业务 metadata 文本生成逻辑。它不是 Codex/Evolver 编码代理的系统提示词。

## 数据来源

- `libs/common/src/utils/sat-audio.ts`
- `apps/app-api/src/modules/sat/*`
- `apps/admin-api/src/modules/sat/*`
- `apps/app-api/src/modules/sat/docs/sat-module-class-diagram.md`

## 当前生成格式

`writeSatMetadataFile()` 会为每个切片生成一个 `.TXT` 文件，内容格式为：

```text
tools: <tool+tool>, actions: <action+action>, position: <position+position>, strength: <strength+strength>
```

字段来源于 Label Studio 风格标注聚合后的 `SatSegment`：

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `tool` | `from_name = tool` | 工具标签数组。 |
| `action` | `from_name = action` | 动作标签数组。 |
| `position` | `from_name = position` | 位置标签数组。 |
| `strength` | `from_name = strength` | 强度选项数组。 |
| `texture` | `from_name = texture` | 当前聚合但不写入 TXT prompt。 |
| `description` | `from_name = description` | 当前聚合但不写入 TXT prompt。 |

## 编码规则

- 修改 metadata 格式时，同步测试、文档和下游消费逻辑。
- 如果未来把 `texture` 或 `description` 写入 prompt，需要明确排序和空值行为。
- 不要把这个 metadata prompt 当作 AI 编码代理提示词。
- 文件写出路径和 ffmpeg 切割逻辑应保持错误显式抛出，不要用默认值吞掉标注问题。
