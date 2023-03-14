"use strict";

const Log = require("@dazn/lambda-powertools-logger");
const line = require("@line/bot-sdk");
const axios = require("axios");
const Redis = require("ioredis");
const request = require("request");
const sendMessage = require("./util/send_message.js");

// const redis = new Redis.Cluster([
//   { port: 6379, host: process.env.REDIS_URL1 },
//   { port: 6379, host: process.env.REDIS_URL2 },
// ]);

// LINEの設定
const client = new line.Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

// レスポンス生成
function generateResponse(statusCode, lineStatus, message) {
  return {
    statusCode: statusCode,
    headers: { "X-Line-Status": lineStatus },
    body: `{"result":"${message}"}`,
  };
}

// // GPT-3にリクエストを送信する
// async function getCompletion(context) {
//   const model = "gpt-3.5-turbo";
//   const url = "https://api.openai.com/v1/chat/completions";
//   const headers = {
//     "Content-Type": "application/json",
//     Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//   };
//   const data = {
//     model,
//     max_tokens: 1024,
//     messages: context,
//   };
//   try {
//     const response = await axios.post(url, data, { headers });
//     Log.info("GPT-3", { data: response.data });
//     return response.data;
//   } catch (error) {
//     Log.error("GPT-3", { error });
//     return null;
//   }
// }

// GPT-4にリクエストを送信する
async function getCompletion(context) {
  // const model = "gpt-3.5-turbo";
  const model = "gpt-3.5-turbo-0301";
  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  };
  const data = {
    model,
    max_tokens: 2048,
    messages: context,
  };
  try {
    const response = await axios.post(url, data, { headers });
    Log.info("GPT-3", { data: response.data });
    return response.data;
  } catch (error) {
    Log.error("GPT-3", { error });
    return null;
  }
}

// Redisにコンテキストを保存する
async function saveContext(userId, context) {
  try {
    Log.info("Redis", { context });
    await redis.set(`line-gpt35turbo-${userId}`, context);
    await redis.expire(context.userId, 60 * 60);
  } catch (error) {
    Log.error("Redis", { error });
    return null;
  }
}

// Redisからコンテキストを取得する
async function getContext(userId) {
  try {
    const context = await redis.get(`line-gpt35turbo-${userId}`);
    return context;
  } catch (error) {
    Log.error("Redis", { error });
    return null;
  }
}

// Redisからコンテキストを削除する
async function deleteContext(userId) {
  try {
    await redis.del(`line-gpt35turbo-${userId}`);
  } catch (error) {
    Log.error("Redis", { error });
    return null;
  }
}

// LINEにメッセージを返信する
async function replyMessage(replyToken, message) {
  try {
    const result = await client.replyMessage(replyToken, message);
    return result;
  } catch (error) {
    console.error(`Get profile error: ${error}`);
    return null;
  }
}

// メッセージを結合する
const mergeMessages = (chatContext, text) => {
  let messages = [];
  if (chatContext) {
    messages = JSON.parse(chatContext);
  }
  messages.push({ role: "user", content: text });
  return messages;
};

// LINEメイン処理
module.exports.callback = async (event, context) => {
  const body = JSON.parse(event.body);
  const userId = body.events[0].source.userId;
  const text = body.events[0].message.text;
  const replyToken = body.events[0].replyToken;

  // redisからコンテキストを取得する
  const chatContext = await getContext(userId);
  const messages = mergeMessages(chatContext, text);
  Log.info("一連のメッセージ", { messages });

  // 会話の内容をすべて引数に渡す
  const response = await getCompletion(messages);
  if (response) {
    const message = {
      type: "text",
      text: response.choices[0].message.content.trim(),
    };
    const messageResult = await replyMessage(replyToken, message);

    // 結果をredisに保存する
    messages.push(response.choices[0].message);
    await saveContext(userId, JSON.stringify(messages));
    Log.info("送信結果", { data: messageResult });

    // リソースが作られたことを示す
    return generateResponse(201, "OK", "success");
  } else {
    await replyMessage(replyToken, {
      type: "text",
      text: "タイムアウトエラーです。時間を置いて再度お試しください。",
    });
    // contextを削除する
    await deleteContext(userId);

    return generateResponse(500, "NG", "error");
  }
};

// Twitterメイン処理
module.exports.tweet = async (event, context) => {
  const headers = { Authorization: `Bearer ${process.env.API_TOKEN}` };
  const apiParams = {
    api_key: process.env.PARKLOT_API_KEY,
    client_id: process.env.PARKLOT_CLIENT_ID,
    token: process.env.API_TOKEN,
  };
  const ongoingUrl = `${process.env.BASE_URL}/hashtag_campaign/lambda/hashtag_campaigns/ongoing`;

  // 進行中のキャンペーンを取得する
  const response = await axios.get(ongoingUrl, {
    headers,
    params: apiParams,
  });
  const hashtag_campaigns = response.data.records.hashtag_campaigns;
  Log.info("開催中キャンペーン", hashtag_campaigns);

  // フォローチェック
  axios.get("https://api.twitter.com/1.1/friendships/show.json", {
    headers,
    params: {
      source_screen_name: process.env.TWITTER_SCREEN_NAME,
      target_screen_name: process.env.TWITTER_TARGET_SCREEN_NAME,
    },
  });

  // await sendMessage("メッセージを受信しました。");
};
