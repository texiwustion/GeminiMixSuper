import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

dotenv.config();

const app = express();
app.use(express.json({ limit: '20mb' }));

const PROXY_URL = process.env.PROXY_URL;
const PROXY_PORT = Number(process.env.PROXY_PORT);

const DEEPSEEK_R1_API_KEY = process.env.DEEPSEEK_R1_API_KEY;
const DEEPSEEK_R1_MODEL = process.env.DEEPSEEK_R1_MODEL;
const DEEPSEEK_R1_MAX_TOKENS = Number(process.env.DEEPSEEK_R1_MAX_TOKENS);
const DEEPSEEK_R1_CONTEXT_WINDOW = Number(process.env.DEEPSEEK_R1_CONTEXT_WINDOW);
const DEEPSEEK_R1_TEMPERATURE = Number(process.env.DEEPSEEK_R1_TEMPERATURE);

const GEMINI_1206_API_KEY = process.env.GEMINI_1206_API_KEY;
const GEMINI_1206_MODEL = process.env.GEMINI_1206_MODEL;
const GEMINI_1206_MAX_TOKENS = Number(process.env.GEMINI_1206_MAX_TOKENS);
const GEMINI_1206_CONTEXT_WINDOW = Number(process.env.GEMINI_1206_CONTEXT_WINDOW);
const GEMINI_1206_TEMPERATURE = Number(process.env.GEMINI_1206_TEMPERATURE);

const RELAY_PROMPT = process.env.RELAY_PROMPT;
const HYBRID_MODEL_NAME = process.env.HYBRID_MODEL_NAME || 'Gemini1206MIXR1';
const OUTPUT_API_KEY = process.env.OUTPUT_API_KEY;

const Image_Model_API_KEY = process.env.Image_Model_API_KEY;
const Image_MODEL = process.env.Image_MODEL;
const Image_Model_MAX_TOKENS = Number(process.env.Image_Model_MAX_TOKENS);
const Image_Model_CONTEXT_WINDOW = Number(process.env.Image_Model_CONTEXT_WINDOW);
const Image_Model_TEMPERATURE = Number(process.env.Image_Model_TEMPERATURE);
const Image_Model_PROMPT = process.env.Image_Model_PROMPT;
const Image_SendR1_PROMPT = process.env.Image_SendR1_PROMPT;

// 添加新的环境变量
const GoogleSearch_API_KEY = process.env.GoogleSearch_API_KEY;
const GoogleSearch_MODEL = process.env.GoogleSearch_MODEL;
const GoogleSearch_Model_MAX_TOKENS = Number(process.env.GoogleSearch_Model_MAX_TOKENS);
const GoogleSearch_Model_CONTEXT_WINDOW = Number(process.env.GoogleSearch_Model_CONTEXT_WINDOW);
const GoogleSearch_Model_TEMPERATURE = Number(process.env.GoogleSearch_Model_TEMPERATURE);
const GoogleSearch_Determine_PROMPT = process.env.GoogleSearch_Determine_PROMPT;
const GoogleSearch_PROMPT = process.env.GoogleSearch_PROMPT;
const GoogleSearch_Send_PROMPT = process.env.GoogleSearch_Send_PROMPT;

// 用于存储当前任务的信息
let currentTask = null;

// 添加URL内容缓存
const urlContentCache = new Map();

// 添加URL内容解析函数
async function parseUrlContent(url) {
    // 检查缓存
    if (urlContentCache.has(url)) {
        console.log('使用缓存的URL内容:', url);
        return urlContentCache.get(url);
    }

    console.log('开始解析URL内容:', url);
    try {
        // 使用通用的请求头
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        const response = await axios.get(url, {
            headers,
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: status => status < 400
        });

        const $ = cheerio.load(response.data);

        // 1. 移除所有干扰元素
        const removeSelectors = [
            'script', 'style', 'iframe', 'video',
            'header', 'footer', 'nav', 'aside',
            '[class*="banner"]', '[class*="advert"]', '[class*="ads"]',
            '[class*="cookie"]', '[class*="popup"]', '[id*="banner"]',
            '[id*="advert"]', '[id*="ads"]', '[class*="share"]',
            '[class*="social"]', '[class*="comment"]', '[class*="related"]'
        ];
        removeSelectors.forEach(selector => $(selector).remove());

        // 2. 智能识别主要内容区域
        let mainContent = '';
        
        // 2.1 首先尝试查找文章标题
        const possibleTitles = $('h1').first().text().trim() || 
                             $('[class*="title"]').first().text().trim() ||
                             $('title').text().trim();

        // 2.2 查找最可能的主要内容容器
        const contentSelectors = [
            'article', '[class*="article"]', '[class*="post"]',
            '[class*="content"]', 'main', '#main',
            '.text', '.body', '.entry'
        ];

        let $mainContainer = null;
        let maxTextLength = 0;

        // 遍历所有可能的内容容器,找到文本最多的那个
        contentSelectors.forEach(selector => {
            $(selector).each((_, element) => {
                const $element = $(element);
                const textLength = $element.text().trim().length;
                if (textLength > maxTextLength) {
                    maxTextLength = textLength;
                    $mainContainer = $element;
                }
            });
        });

        // 2.3 如果找到了主容器,提取其中的段落文本
        if ($mainContainer) {
            const paragraphs = [];
            $mainContainer.find('p, h2, h3, h4, li').each((_, element) => {
                const text = $(element).text().trim();
                if (text && text.length > 20) { // 只保留有意义的段落
                    paragraphs.push(text);
                }
            });
            mainContent = paragraphs.join('\n\n');
        }

        // 2.4 如果主容器没有足够的内容,回退到全文检索
        if (mainContent.length < 100) {
            const bodyText = [];
            $('body').find('p, h2, h3, h4, li').each((_, element) => {
                const text = $(element).text().trim();
                if (text && text.length > 20) {
                    bodyText.push(text);
                }
            });
            mainContent = bodyText.join('\n\n');
        }

        // 3. 清理和格式化文本
        let content = mainContent
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .replace(/([.!?])\s+/g, '$1\n')  // 在句子结尾添加换行
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // 4. 添加标题(如果找到了)
        if (possibleTitles) {
            content = `${possibleTitles}\n\n${content}`;
        }

        // 5. 限制长度
        const maxLength = 8000;
        if (content.length > maxLength) {
            content = content.substring(0, maxLength) + '...';
        }

        // 6. 验证内容质量
        if (!content || content.length < 50 || 
            /404|error|not found|访问受限|无权访问|请稍后重试/.test(content)) {
            throw new Error('未能提取到有效内容');
        }

        // 7. 格式化最终输出
        const formattedContent = `[以下是来自 ${url} 的网页内容]\n${content}\n[网页内容结束]`;
        
        // 存入缓存
        urlContentCache.set(url, formattedContent);
        
        console.log('成功解析URL内容,长度:', content.length);
        return formattedContent;
        
    } catch (error) {
        console.error('URL内容解析失败:', error);
        return `[无法获取 ${url} 的内容: ${error.message}。这可能是因为该网站有访问限制或内容不可用。]`;
    }
}

// API 密钥验证中间件
const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers.authorization;

    if (!apiKey || apiKey !== `Bearer ${OUTPUT_API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
    }
    next();
};

// 添加一个用于简化日志输出的辅助函数
function sanitizeLogContent(content) {
    if (Array.isArray(content)) {
        return content.map(item => {
            if (item.type === 'image_url' && item.image_url?.url) {
                return {
                    ...item,
                    image_url: {
                        ...item.image_url,
                        url: item.image_url.url.substring(0, 20) + '...[base64]...'
                    }
                };
            }
            return item;
        });
    }
    return content;
}

// 应用 API 密钥验证中间件
app.post('/v1/chat/completions', apiKeyAuth, async (req, res) => {
    // 使用sanitizeLogContent处理日志输出
    const logSafeBody = {
        ...req.body,
        messages: req.body.messages.map(msg => ({
            ...msg,
            content: sanitizeLogContent(msg.content)
        }))
    };
    console.log('收到新请求:', JSON.stringify(logSafeBody, null, 2));
    
    let geminiResponseSent = false;
    const cancelTokenSource = axios.CancelToken.source();
    
    if (currentTask) {
        currentTask.cancelTokenSource.cancel('New request received');
        if (!currentTask.res.writableEnded) {
            currentTask.res.end();
        }
        await currentTask.cancelPromise;
        currentTask = null;
    }

    try {
        const originalRequest = req.body;
        
        // 处理消息中的URL
        let messages = [...originalRequest.messages];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (typeof msg.content === 'string') {
                // 查找URL
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const urls = msg.content.match(urlRegex);
                
                if (urls) {
                    console.log('发现URL:', urls);
                    // 解析所有URL内容
                    const urlContents = await Promise.all(
                        urls.map(url => parseUrlContent(url))
                    );
                    
                    // 替换URL为解析后的内容
                    let newContent = msg.content;
                    urls.forEach((url, index) => {
                        newContent = newContent.replace(url, urlContents[index]);
                    });
                    
                    messages[i] = {
                        ...msg,
                        content: newContent
                    };
                }
            }
        }
        
        // 使用处理后的消息继续原有流程
        const requestedModel = originalRequest.model;

        // 检查模型是否支持
        if (requestedModel !== HYBRID_MODEL_NAME) {
            res.status(400).send({ error: `Model not supported: ${requestedModel}` });
            return;
        }

        // 处理新的图片消息
        let image_index_content = null;
        if (hasNewImages(messages)) {
            console.log('发现新图片，开始处理'); // 添加日志
            const images = extractLastImages(messages);
            console.log(`提取到 ${images.length} 张图片`); // 添加日志
            
            try {
                // 处理所有新图片
                const imageDescriptions = await Promise.all(
                    images.map(async (img) => await processImage(img))
                );
                
                image_index_content = imageDescriptions.join('\n');
                console.log('所有图片处理完成，合并后的描述:', image_index_content); // 添加日志
            } catch (error) {
                console.error('图片处理失败:', error);
                res.status(500).send({ error: 'Failed to process images', details: error.message });
                return;
            }
        }

        // 判断是否需要联网搜索
        let searchResults = null;
        const needSearch = await determineIfSearchNeeded(messages);
        if (needSearch) {
            console.log('需要联网搜索，开始执行搜索');
            searchResults = await performWebSearch(messages);
        }

        // 准备发送给 R1 的消息
        let messagesForR1 = [...messages];
        
        // 如果有搜索结果，添加到消息中
        if (searchResults) {
            console.log('添加搜索结果到消息中');
            messagesForR1.push({
                role: 'system',
                content: `${GoogleSearch_Send_PROMPT}${searchResults}`
            });
        }

        // 如果有新图片描述，添加到 R1 的消息中
        if (image_index_content) {
            console.log('添加图片描述到 R1 消息中:', image_index_content); // 添加日志
            messagesForR1.push({
                role: 'system',
                content: `${Image_SendR1_PROMPT}${image_index_content}`
            });
        }

        console.log('发送给 R1 的最终消息:', JSON.stringify(messagesForR1.map(msg => ({
            ...msg,
            content: Array.isArray(msg.content) 
                ? sanitizeLogContent(msg.content)
                : msg.content
        })), null, 2));

        // 移除所有消息中的图片数据，因为 R1 不支持图片
        messagesForR1 = messagesForR1.map(msg => {
            if (Array.isArray(msg.content)) {
                return {
                    ...msg,
                    content: msg.content
                        .filter(item => item.type === 'text')
                        .map(item => item.text)
                        .join(' ')
                };
            }
            return msg;
        });

        // 发送给 R1 的请求
        const deepseekResponse = await axios.post(
            `${PROXY_URL}/v1/chat/completions`,
            {
                model: DEEPSEEK_R1_MODEL,
                messages: messagesForR1,
                max_tokens: DEEPSEEK_R1_MAX_TOKENS,
                temperature: DEEPSEEK_R1_TEMPERATURE,
                stream: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${DEEPSEEK_R1_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'stream',
                cancelToken: cancelTokenSource.token,
                timeout: 30000,
                retry: 3,
                retryDelay: (retryCount) => retryCount * 1000,
                validateStatus: (status) => {
                    return status < 500; // 只重试 5xx 错误
                }
            }
        ).catch(async error => {
            console.error('Deepseek R1 request failed:', error);
            console.log('R1 模型重试失败，准备切换到 Gemini');
            
            if (!geminiResponseSent && !res.headersSent && !res.writableEnded) {
                const geminiMessages = [
                    ...messages,
                    { 
                        role: 'system', 
                        content: '由于前置思考系统暂时无法使用，请直接进行回复。' 
                    }
                ];

                try {
                    await callGemini(geminiMessages, res, cancelTokenSource, originalRequest);
                } catch (geminiError) {
                    console.error('Both R1 and Gemini failed:', geminiError);
                    if (!res.headersSent && !res.writableEnded) {
                        res.status(500).json({
                            error: 'Service unavailable',
                            message: '服务暂时不可用，请稍后重试'
                        });
                    }
                }
            }
        });

        let thinkingContent = '';
        let receivedThinkingEnd = false;
        let choiceIndex = 0;
        let geminiResponseSent = false; // 标记 Gemini 响应是否已发送
        let thinkTagSent = false; // 添加 thinkTagSent 标志位

        // 创建一个 Promise 来包装取消操作
        let cancelResolve;
        const cancelPromise = new Promise(resolve => {
            cancelResolve = resolve;
        });

        // 存储当前任务信息
        currentTask = { cancelTokenSource, res, cancelPromise, cancelResolve };

        deepseekResponse.data.on('data', (chunk) => {
            setTimeout(() => {
            const chunkStr = chunk.toString();
            console.log('Received chunk from Deepseek R1:', chunkStr); // 详细日志 (1)

            // 尝试解析 Deepseek R1 的 chunk
            try {
                if (chunkStr.trim() === 'data: [DONE]') {
                    // Skip JSON parsing for [DONE] chunk
                    return;
                }
                const deepseekData = JSON.parse(chunkStr.replace(/^data: /, ''));

                // 构造 OpenAI 格式的 SSE 消息
                const formattedData = {
                    id: deepseekData.id,
                    object: 'chat.completion.chunk',
                    created: deepseekData.created,
                    model: HYBRID_MODEL_NAME,
                    choices: deepseekData.choices.map((choice, index) => {
                        let deltaContent = choice.delta.reasoning_content;
                        if (!deltaContent) {
                            deltaContent = ""; // 如果 reasoning_content 为空，则不发送内容
                        }
                        return {
                            delta: {
                                content: deltaContent,
                            },
                            index: index,
                            finish_reason: choice.finish_reason,
                        };
                    }),
                };
                if (formattedData.choices[0].delta.content) { // 仅当 delta 中有内容时才发送
                    if (!geminiResponseSent && !thinkTagSent) { // 检查 Gemini 响应是否已发送和 thinkTagSent 标志位
                        formattedData.choices[0].delta.content = "<think>AiModel辅助思考系统已载入。" + formattedData.choices[0].delta.content; // 添加 <think> 标签
                        thinkTagSent = true; // 设置 thinkTagSent 为 true
                    }
                    res.write(`data: ${JSON.stringify(formattedData)}\n\n`);
                }
            } catch (error) {
                console.error('Error parsing Deepseek R1 chunk:', error);
                // 可以选择发送错误信息给客户端或忽略错误
                // res.write(`data: {"error": "Error parsing chunk"}\n\n`);
            }

            if (!receivedThinkingEnd) {
                try {
                    const deepseekData = JSON.parse(chunkStr.replace(/^data: /, ''));
                    const reasoningContent = deepseekData.choices[0]?.delta?.reasoning_content || '';
                    thinkingContent += reasoningContent;
                    console.log('Current thinkingContent:', thinkingContent); // 详细日志 (2)
                    console.log('Chunk string:', JSON.stringify(chunkStr)); // 详细日志 (2.1) - 打印 chunkStr 详细信息
                    console.log('Thinking content before check:', thinkingContent); // 详细日志 (2.2) - 打印 thinkingContent 内容
                    if (!reasoningContent && thinkingContent !== '') {
                        console.log('Reasoning content finished, Gemini API call should be triggered'); // 详细日志 (2.4) - 标记 Gemini API 调用
                        receivedThinkingEnd = true;
                        deepseekResponse.data.destroy();
                        
                        // 修改这里：保留原始消息格式（包含图片）
                        const geminiMessages = [
                            ...messages, // 保持原始消息不变，包含图片数据
                            { 
                                role: 'assistant', 
                                content: thinkingContent 
                            },
                            { 
                                role: 'user', 
                                content: RELAY_PROMPT 
                            }
                        ];

                        console.log('发送给 Gemini 的消息:', JSON.stringify(geminiMessages, null, 2)); // 添加日志

                        axios.post(
                            `${process.env.PROXY_URL2}/v1/chat/completions`,
                            {
                                model: GEMINI_1206_MODEL,
                                messages: geminiMessages,
                                max_tokens: GEMINI_1206_MAX_TOKENS,
                                temperature: GEMINI_1206_TEMPERATURE,
                                stream: true,
                            },
                            {
                                headers: {
                                    Authorization: `Bearer ${GEMINI_1206_API_KEY}`,
                                    'Content-Type': 'application/json',
                                },
                                responseType: 'stream',
                                cancelToken: cancelTokenSource.token, // 使用相同的 cancelToken
                                timeout: 30000, // 设置超时时间为 30 秒
                                // 使用 axios-retry 配置重试
                                retry: 3, // 重试次数
                                retryDelay: (retryCount) => retryCount * 1000, // 重试延迟，每次递增 1 秒
                                shouldRetry: (error) => { // 只有在特定情况下才重试
                                    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED' || error.response?.status === 429 || error.response?.status >= 500; // 网络错误、幂等请求错误、超时错误、429 或 5xx 错误时重试
                                },
                            }
                        ).then(geminiResponse => {
                            console.log('Gemini API call successful - from Deepseek flow'); // 修改日志
                            console.log('Gemini API request config:', geminiResponse.config); // 打印请求配置
                            console.log('Gemini API response data:', geminiResponse.data); // 打印响应数据
                            geminiResponseSent = true; // 标记 Gemini 响应已发送
                            res.write('data: {"choices": [{"delta": {"content": "\\n辅助思考已结束，以上辅助思考内容用户不可见，请MODEL开始正式输出</think>"}, "index": 0, "finish_reason": null}]}\n\n'); // 输出 </think> 标签
                            geminiResponse.data.on('data', (geminiChunk) => {
                                console.log('Received chunk from Gemini:', geminiChunk.toString()); // 详细日志 (5)
                                const geminiChunkStr = geminiChunk.toString();
                                const geminiData = geminiChunkStr.split('\n').filter(line => line.trim() !== '').map(line => {
                                    try {
                                        const geminiJson = JSON.parse(line.replace(/^data: /, ''));
                                        const geminiDelta = geminiJson.choices[0]?.delta?.content || '';
                                        return {
                                            id: `chatcmpl-${Date.now()}`,
                                            object: 'chat.completion.chunk',
                                            created: Math.floor(Date.now() / 1000),
                                            model: HYBRID_MODEL_NAME,
                                            choices: [
                                                {
                                                    delta: {
                                                        content: geminiDelta,
                                                    },
                                                    index: choiceIndex++,
                                                    finish_reason: null,
                                                },
                                            ],
                                        };
                                    } catch (parseError) {
                                        console.error('Error parsing Gemini chunk:', parseError);
                                        return null; // 或者返回一个错误对象，根据你的错误处理策略
                                    }
                                }).filter(Boolean); // 移除解析失败的条目
                                if (geminiData.length > 0) {
                                    const formattedResponse = geminiData.map(data => `data: ${JSON.stringify(data)}\n\n`).join('');
                                    console.log('formattedResponse:', formattedResponse); // 详细日志 (6)
                                    res.write(formattedResponse);
                                }
                            });

                            geminiResponse.data.on('end', () => {
                                console.log('Gemini response ended.');
                                res.write('data: [DONE]\n\n');
                                if (!res.writableEnded) {
                                    res.end();
                                }
                                currentTask?.cancelResolve(); // 取消操作完成
                                currentTask = null; // 清理当前任务
                            });

                            geminiResponse.data.on('error', (error) => {
                                if (error.message !== 'New request received') {
                                    console.error('Gemini response error:', error);
                                }
                                if (!res.writableEnded) {
                                    res.end();
                                }
                                currentTask?.cancelResolve(); // 取消操作完成
                                currentTask = null; // 清理当前任务
                            });
                        }).catch(error => {
                            geminiResponseSent = true; // 标记 Gemini 响应已发送 (即使发生错误)
                            console.error('Gemini API call error - from Deepseek flow:', error); // 修改日志
                            console.error('Gemini API call error:', error); // 打印 详细错误信息
                            console.error('Gemini API request config:', error.config); // 打印请求配置
                            console.error('Gemini API response data:', error.response?.data); // 打印响应数据
                            console.error('Gemini API request config:', error.config); // 打印请求配置
                            console.error('Gemini API response data:', error.response?.data); // 打印响应数据
                            if (!res.writableEnded) {
                                let errorMessage = 'Error calling Gemini API';
                                if (error.code === 'ECONNABORTED') {
                                    errorMessage = 'Gemini API request timed out.';
                                    res.status(504).send({ error: errorMessage }); // 504 Gateway Timeout
                                } else if (error.response?.status === 429) {
                                    errorMessage = 'Gemini API rate limit exceeded.';
                                    res.status(429).send({ error: errorMessage, details: error.response?.data }); // 429 Too Many Requests
                                } else if (error.config?.__retryCount >= 3) { // 假设重试 3 次后失败
                                    errorMessage = 'Gemini API request failed after multiple retries.';
                                    console.log('返回 503 错误 - callGemini 函数中，Gemini API 多次重试失败'); // 添加日志
                                    res.status(503).send({ error: errorMessage }); // 503 Service Unavailable
                                }
                                else {
                                    res.status(error.response?.status || 500).send({ error: `${errorMessage}: ${error.message}`, details: error.response?.data?.message || error.response?.data }); // 500 Internal Server Error 或 Gemini 返回的状态码, 只发送 message 或 简化的 data
                                }
                                res.end(); // 确保在 Gemini API 错误时也结束响应
                            }
                            currentTask?.cancelResolve(); // 取消操作完成
                            currentTask = null; // 清理当前任务
                        });
                    }
                } catch (error) {
                    console.error('Error parsing Deepseek R1 chunk for thinking content:', error);
                }
            }
        }, 600); // 延迟 0.6 秒
    });

        deepseekResponse.data.on('end', () => {
            console.log('Deepseek response ended. receivedThinkingEnd:', receivedThinkingEnd);
            if (!geminiResponseSent) {
                // 确保在 Gemini 没有被调用的情况下也发送 [DONE]，并且 Gemini 响应尚未发送
                if (!res.writableEnded && !geminiResponseSent) {
                    res.write('data: [DONE]\n\n');
                    res.end();
                }
            }
            currentTask?.cancelResolve(); // 取消操作完成
            currentTask = null; // 清理当前任务
        });

        deepseekResponse.data.on('error', async (error) => {
            console.error('Deepseek R1 request error:', error);
            
            if (error.message === 'New request received') {
                return;
            }

            if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
                if (!geminiResponseSent && !res.headersSent && !res.writableEnded) {
                    const geminiMessages = [
                        ...messages,
                        { 
                            role: 'system', 
                            content: '由于前置思考系统连接中断，请直接进行回复。' 
                        }
                    ];

                    try {
                        await callGemini(geminiMessages, res, cancelTokenSource, originalRequest);
                    } catch (geminiError) {
                        console.error('Both R1 and Gemini failed:', geminiError);
                        if (!res.headersSent && !res.writableEnded) {
                            res.status(500).json({
                                error: 'Connection interrupted',
                                message: '网络连接中断，请重新发送请求'
                            });
                        }
                    }
                }
                
                if (currentTask) {
                    currentTask.cancelTokenSource.cancel('Connection interrupted');
                    currentTask.cancelResolve();
                    currentTask = null;
                }
                
                return;
            }
        });
    } catch (error) {
        console.error('请求处理错误:', error);
        if (!res.headersSent && !res.writableEnded) {
            res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        }
        currentTask?.cancelResolve();
        currentTask = null;
    }
});

// 修改 callGemini 函数，添加完整的响应处理
function callGemini(messages, res, cancelTokenSource, originalRequest) {
    return new Promise((resolve, reject) => {
        let choiceIndex = 0;
        // 创建用于日志的安全版本
        const logSafeMessages = messages.map(msg => ({
            ...msg,
            content: Array.isArray(msg.content) 
                ? sanitizeLogContent(msg.content)
                : msg.content
        }));
        console.log('callGemini function called with messages:', JSON.stringify(logSafeMessages, null, 2));

        // 如果是从 R1 错误处理转发来的请求，添加提示信息
        if (originalRequest) {
            res.write('data: {"choices": [{"delta": {"content": "*前置辅助思考模型响应异常，已切换到正式输出模型*\\n"}, "index": 0, "finish_reason": null}]}\n\n');
        }

        axios.post(
            `${process.env.PROXY_URL2}/v1/chat/completions`,
            {
                model: GEMINI_1206_MODEL,
                messages: messages,
                max_tokens: GEMINI_1206_MAX_TOKENS,
                temperature: GEMINI_1206_TEMPERATURE,
                stream: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${GEMINI_1206_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'stream',
                cancelToken: cancelTokenSource.token,
                timeout: 30000
            }
        ).then(geminiResponse => {
            console.log('Gemini API call successful');

            geminiResponse.data.on('data', chunk => {
                try {
                    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content || '';
                            if (content) {
                                const formattedChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: 'chat.completion.chunk',
                                    created: Math.floor(Date.now() / 1000),
                                    model: HYBRID_MODEL_NAME,
                                    choices: [{
                                        delta: { content },
                                        index: choiceIndex++,
                                        finish_reason: null
                                    }]
                                };
                                res.write(`data: ${JSON.stringify(formattedChunk)}\n\n`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing Gemini chunk:', error);
                }
            });

            geminiResponse.data.on('end', () => {
                console.log('Gemini response ended');
                res.write('data: [DONE]\n\n');
                res.end();
                resolve();
            });

            geminiResponse.data.on('error', error => {
                console.error('Gemini stream error:', error);
                reject(error);
            });
        }).catch(error => {
            console.error('Gemini API call error:', error);
            reject(error);
        });
    });
}

// 处理图片识别的函数
async function processImage(imageMessage) {
    // 创建用于日志的安全版本
    const logSafeImageMessage = {
        ...imageMessage,
        image_url: imageMessage.image_url ? {
            ...imageMessage.image_url,
            url: imageMessage.image_url.url.substring(0, 20) + '...[base64]...'
        } : imageMessage.image_url
    };
    console.log('开始处理图片:', JSON.stringify(logSafeImageMessage, null, 2));
    
    try {
        const requestBody = {
            model: Image_MODEL,
            messages: [
                { role: "system", content: Image_Model_PROMPT },
                { role: "user", content: [imageMessage] }  // 保持原始数据用于实际请求
            ],
            max_tokens: Image_Model_MAX_TOKENS,
            temperature: Image_Model_TEMPERATURE,
            stream: false,
        };
        
        // 创建用于日志的安全版本
        const logSafeRequestBody = {
            ...requestBody,
            messages: requestBody.messages.map(msg => ({
                ...msg,
                content: Array.isArray(msg.content) 
                    ? msg.content.map(item => {
                        if (item.type === 'image_url' && item.image_url?.url) {
                            return {
                                ...item,
                                image_url: {
                                    ...item.image_url,
                                    url: item.image_url.url.substring(0, 20) + '...[base64]...'
                                }
                            };
                        }
                        return item;
                    })
                    : msg.content
            }))
        };
        
        console.log('发送给图像识别模型的请求:', JSON.stringify(logSafeRequestBody, null, 2));
        
        const response = await axios.post(
            `${process.env.PROXY_URL3}/v1/chat/completions`,
            requestBody,  // 使用原始数据发送请求
            {
                headers: {
                    Authorization: `Bearer ${Image_Model_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        
        console.log('图像识别模型响应:', JSON.stringify(response.data, null, 2));
        
        const content = response.data.choices[0].message.content;
        console.log('图片描述结果:', content);
        return content;
    } catch (error) {
        console.error('图片处理错误:', error);
        console.error('错误详情:', {
            message: error.message,
            response: error.response?.data,
            config: {
                ...error.config,
                data: error.config?.data ? JSON.parse(error.config.data).messages.map(msg => ({
                    ...msg,
                    content: Array.isArray(msg.content) 
                        ? msg.content.map(item => {
                            if (item.type === 'image_url' && item.image_url?.url) {
                                return {
                                    ...item,
                                    image_url: {
                                        ...item.image_url,
                                        url: item.image_url.url.substring(0, 20) + '...[base64]...'
                                    }
                                };
                            }
                            return item;
                        })
                        : msg.content
                })) : error.config?.data
            }
        });
        throw error;
    }
}

// 检查消息是否包含本轮新的图片
function hasNewImages(messages) {
    const logSafeMessages = messages.map(msg => ({
        ...msg,
        content: sanitizeLogContent(msg.content)
    }));
    console.log('检查新图片 - 完整消息:', JSON.stringify(logSafeMessages, null, 2));
    const lastMessage = messages[messages.length - 1];
    const hasImages = lastMessage && Array.isArray(lastMessage.content) && 
                     lastMessage.content.some(item => item.type === 'image_url');
    console.log('是否包含新图片:', hasImages); // 添加日志
    return hasImages;
}

// 提取最后一条消息中的图片
function extractLastImages(messages) {
    const lastMessage = messages[messages.length - 1];
    const logSafeMessage = {
        ...lastMessage,
        content: sanitizeLogContent(lastMessage.content)
    };
    console.log('提取图片 - 最后一条消息:', JSON.stringify(logSafeMessage, null, 2));
    if (!lastMessage || !Array.isArray(lastMessage.content)) {
        console.log('没有找到图片消息');
        return [];
    }
    const images = lastMessage.content.filter(item => item.type === 'image_url');
    // 创建用于日志的安全版本
    const logSafeImages = images.map(img => ({
        ...img,
        image_url: img.image_url ? {
            ...img.image_url,
            url: img.image_url.url.substring(0, 20) + '...[base64]...'
        } : img.image_url
    }));
    console.log('提取到的图片:', JSON.stringify(logSafeImages, null, 2));
    return images;
}

// 添加判断是否需要联网搜索的函数
async function determineIfSearchNeeded(messages) {
    console.log('开始判断是否需要联网搜索');
    try {
        const response = await axios.post(
            `${process.env.PROXY_URL4}/v1/chat/completions`,
            {
                model: GoogleSearch_MODEL,
                messages: [
                    { role: "system", content: GoogleSearch_Determine_PROMPT },
                    ...messages
                ],
                max_tokens: GoogleSearch_Model_MAX_TOKENS,
                temperature: GoogleSearch_Model_TEMPERATURE,
                stream: false,
            },
            {
                headers: {
                    Authorization: `Bearer ${GoogleSearch_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        const decision = response.data.choices[0].message.content.trim().toLowerCase();
        console.log('联网判断结果:', decision);
        return decision === 'yes';
    } catch (error) {
        console.error('联网判断出错:', error);
        return false;
    }
}

// 添加执行联网搜索的函数
async function performWebSearch(messages) {
    console.log('开始执行联网搜索');
    try {
        // 第一步：获取搜索关键词
        const searchTermsResponse = await axios.post(
            `${process.env.PROXY_URL4}/v1/chat/completions`,
            {
                model: GoogleSearch_MODEL,
                messages: [
                    { role: "system", content: GoogleSearch_PROMPT },
                    ...messages
                ],
                max_tokens: GoogleSearch_Model_MAX_TOKENS,
                temperature: GoogleSearch_Model_TEMPERATURE,
                stream: false
            },
            {
                headers: {
                    Authorization: `Bearer ${GoogleSearch_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        const searchTerms = searchTermsResponse.data.choices[0].message.content;
        console.log('搜索关键词:', searchTerms);

        // 第二步：执行实际的搜索
        const searchResponse = await axios.post(
            `${process.env.PROXY_URL4}/v1/chat/completions`,
            {
                model: GoogleSearch_MODEL,
                messages: [
                    { role: "system", content: "Please search the web for the following query and provide relevant information:" },
                    { role: "user", content: searchTerms }
                ],
                max_tokens: GoogleSearch_Model_MAX_TOKENS,
                temperature: GoogleSearch_Model_TEMPERATURE,
                stream: false,
                tools: [{
                    type: "function",
                    function: {
                        name: "googleSearch",
                        description: "Search the web for relevant information",
                        parameters: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "The search query"
                                }
                            },
                            required: ["query"]
                        }
                    }
                }],
                tool_choice: {
                    type: "function",
                    function: {
                        name: "googleSearch"
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${GoogleSearch_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        const searchResults = searchResponse.data.choices[0].message.content;
        console.log('搜索结果:', searchResults);
        return searchResults;
    } catch (error) {
        console.error('联网搜索出错:', error);
        console.error('错误详情:', {
            message: error.message,
            response: error.response?.data,
            config: error.config
        });
        return null;
    }
}

app.listen(PROXY_PORT, () => {
    console.log(`Hybrid AI proxy server started on port ${PROXY_PORT}`);
});
