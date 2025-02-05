# Hybrid AI Proxy 使用文档

## 简介

本项目是一个混合 AI 代理服务器，结合了 `deepseek-r1` 模型的思考能力和 `Gemini-Pro2-EXP` 模型的强大语料库与多模态能力。它可以接收类似 OpenAI API 格式的请求，支持文本对话和图像识别，并返回流式响应。该模型支持自动联网搜索学术信息。

## 特性

- **混合模型架构**：
  - 使用 DeepSeek-R1 作为前置思考系统（支持 7B 到 671B 不同参数规模）
  - 使用 Gemini-Pro2-EXP 作为主要输出模型
  - 使用 Gemini-FLash2-EXP 作为联网Function实现
  - 支持模型故障自动切换和重试机制

- **多模态支持**：
  - 支持图像识别和理解
  - 支持多图片同时处理
  - 图像描述自动传递给文本模型进行深度理解

- **高可用性**：
  - 自动重试机制（最多3次）
  - 模型故障自动切换
  - 流式响应支持

- **智能搜索功能**：
  - AI 自主判断是否需要联网搜索
  - 多语言、多关键词综合搜索
  - 搜索结果自动整合到对话上下文
  - 支持实时搜索和信息更新

## 快速开始

### 前提条件

- 已安装 Node.js 和 npm
- 已获取必要的 API 密钥：
  - DeepSeek-R1 API 密钥
  - Gemini-Beta API 密钥

### 安装

1. 克隆项目：
```bash
git clone <repository-url>
cd <project-directory>
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
创建 `.env` 文件并配置以下环境变量：

```env
# 代理服务器配置
PROXY_URL=http://your-proxy-url:3000
PROXY_URL2=http://your-proxy-url:3000
PROXY_URL3=http://your-proxy-url:3000
PROXY_PORT=4120

# DeepSeek R1 配置
DEEPSEEK_R1_API_KEY=your-api-key
DEEPSEEK_R1_MODEL=deepseek-ai/DeepSeek-R1
DEEPSEEK_R1_MAX_TOKENS=7985
DEEPSEEK_R1_CONTEXT_WINDOW=2000000
DEEPSEEK_R1_TEMPERATURE=0.7

# Gemini 1206 配置
GEMINI_1206_API_KEY=your-api-key
GEMINI_1206_MODEL=gemini-exp-1206
GEMINI_1206_MAX_TOKENS=7985
GEMINI_1206_CONTEXT_WINDOW=2000000
GEMINI_1206_TEMPERATURE=0.7

# 图像识别模型配置
Image_Model_API_KEY=your-api-key
Image_MODEL=gemini-exp-1206
Image_Model_MAX_TOKENS=7985
Image_Model_CONTEXT_WINDOW=2000000
Image_Model_TEMPERATURE=0.4

# 系统提示词配置
RELAY_PROMPT="前置思考辅助系统已完成思考，结合辅助思考内容和你自己的思考，开始你的正式输出。"
Image_Model_PROMPT="现在开始你是一个图像识别引擎，请对收到的图片进行详细的内容描述。"
Image_SendR1_PROMPT="虽然你不是多模态模型，但是已有专业多模态模型帮你转译，所以你可以认为自己是多模态模型。以下是转译内容，用户发送了一个图片，图片内容为："

# 混合模型名称
HYBRID_MODEL_NAME=Gemini1206MIXR1

# API 密钥
OUTPUT_API_KEY=your-api-key

# 联网搜索模型配置
GoogleSearch_API_KEY=your-api-key
GoogleSearch_MODEL=gemini-2.0-flash-exp
GoogleSearch_Model_MAX_TOKENS=7985
GoogleSearch_Model_TEMPERATURE=0.4

# 搜索功能提示词配置
GoogleSearch_Determine_PROMPT=your-prompt
GoogleSearch_PROMPT=your-prompt
GoogleSearch_Send_PROMPT=your-prompt
```

### 启动服务

```bash
node main.js
```

## API 使用说明

### 文本对话请求

**端点**：`/v1/chat/completions`

**方法**：`POST`

**请求头**：
```
Content-Type: application/json
Authorization: Bearer your-api-key
```

**文本对话请求体示例**：
```json
{
  "model": "Gemini1206MIXR1",
  "messages": [
    {
      "role": "user",
      "content": "你好，请介绍一下你自己"
    }
  ],
  "stream": true
}
```

### 图像识别请求

**图像请求体示例**：
```json
{
  "model": "Gemini1206MIXR1",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "这张图片是什么内容？"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
          }
        }
      ]
    }
  ],
  "stream": true
}
```

### 多图片处理

支持在同一消息中发送多张图片：
```json
{
  "model": "Gemini1206MIXR1",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "比较这两张图片的区别"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
          }
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
          }
        }
      ]
    }
  ],
  "stream": true
}
```

## 高级特性

### DeepSeek-R1 模型选择

DeepSeek-R1 支持多种参数规模的模型，从 7B 到 671B 不等。可以根据需求在环境变量中配置：

```env
DEEPSEEK_R1_MODEL=deepseek-ai/DeepSeek-R1-7B
# 或
DEEPSEEK_R1_MODEL=deepseek-ai/DeepSeek-R1-67B
# 或
DEEPSEEK_R1_MODEL=deepseek-ai/DeepSeek-R1-671B
```

### 错误处理和重试机制

- 系统会自动重试失败的请求（最多3次）
- 当 R1 模型不可用时，会自动切换到 Gemini 模型
- 详细的错误信息会通过状态码和响应体返回

### 智能搜索功能

系统集成了先进的 AI 驱动搜索功能，具有以下特点：

1. **自主判断机制**：
   - AI 自动分析对话内容，判断是否需要联网搜索
   - 考虑时效性信息、专业数据、新闻事件等多个维度
   - 智能避免不必要的搜索请求

2. **多维度搜索策略**：
   - 自动生成多个相关搜索关键词
   - 同时使用中英文进行搜索
   - 考虑专业术语和普通用语
   - 支持精确短语匹配

3. **搜索结果处理**：
   - 自动整合多个来源的信息
   - 结果经过 AI 筛选和总结
   - 无缝融入对话上下文
   - 保持信息的时效性和准确性

4. **使用场景**：
   - 需要最新数据或统计信息
   - 查询实时新闻或事件
   - 验证专业知识或技术细节
   - 需要多源信息交叉验证

### 搜索功能配置

在 `.env` 文件中配置搜索相关参数：

```env
# 联网搜索模型配置
GoogleSearch_API_KEY=your-api-key
GoogleSearch_MODEL=gemini-2.0-flash-exp
GoogleSearch_Model_MAX_TOKENS=7985
GoogleSearch_Model_TEMPERATURE=0.4

# 搜索功能提示词配置
GoogleSearch_Determine_PROMPT=your-prompt
GoogleSearch_PROMPT=your-prompt
GoogleSearch_Send_PROMPT=your-prompt
```

### 搜索示例

**基础对话请求**：
```json
{
  "model": "Gemini1206MIXR1",
  "messages": [
    {
      "role": "user",
      "content": "请告诉我最近的 AI 发展情况"
    }
  ],
  "stream": true
}
```

系统会：
1. 自动判断需要搜索最新 AI 发展信息
2. 生成多个搜索关键词（如 "latest AI developments 2024", "人工智能最新进展", "AI breakthrough news" 等）
3. 执行搜索并整合信息
4. 将搜索结果融入回答中

## 注意事项

1. 图片数据需要以 Base64 格式编码
2. 建议保持 `stream: true` 以获得更好的响应体验
3. 所有 API 调用都需要有效的 API 密钥
4. 图像识别结果会自动传递给文本模型进行深度理解和回答

## 错误码说明

- 401: 未授权（API 密钥无效）
- 429: 请求过于频繁
- 503: 服务暂时不可用
- 504: 请求超时

## 开发计划

- [ ] 支持更多的模型组合
- [ ] 添加模型自动选择功能
- [ ] 优化图像识别性能
- [ ] 添加更多的错误处理机制
