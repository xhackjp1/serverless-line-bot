const Log = require("@dazn/lambda-powertools-logger");
const Twitter = require("twitter");

module.exports = async (text) => {
  try {
    const client = new Twitter({
      consumer_key: process.env.CONSUMER_KEY,
      consumer_secret: process.env.CONSUMER_SECRET,
      access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
      access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });
    const statusParams = { status: text };
    const res = await client.post("statuses/update", statusParams);
    Log.info("statuses/update", res);

    if (res.resp.statusCode !== 200) {
      throw new Error(res.resp.headers.status);
    }

    Log.info(`ツイートが成功しました`, message);
  } catch (error) {
    Log.error(`ツイートでエラー発生しました`, error);
  }
};
