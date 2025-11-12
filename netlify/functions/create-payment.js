const crypto = require('crypto');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const requestData = JSON.parse(event.body);
    console.log('📥 收到前端請求:', JSON.stringify(requestData, null, 2));

    // ===== PowerPay 配置 =====
    const MERCHANT_NO = process.env.POWERPAY_MERCHANT_NO || '300000004';
    const MD5_KEY = process.env.POWERPAY_MD5_KEY || '94ed508f4bc242b88ddd0f0d644ebe7a';
    const API_URL = 'https://uat.powerpaygroup.com/gateway/pay';

    console.log('🔑 商戶號:', MERCHANT_NO);
    console.log('🔐 MD5 Key 長度:', MD5_KEY.length);

    // ===== 構建 PowerPay 參數 =====
    const params = {
      merchantNo: MERCHANT_NO,
      orderNo: requestData.orderNo,
      amount: String(requestData.amount),
      subject: requestData.subject,
      payType: requestData.payType,
      frontUrl: requestData.frontUrl,
      notifyUrl: requestData.notifyUrl,
    };

    // UnionPay 卡片信息（如果有）
    if (requestData.payType === 'UNIONPAY') {
      if (requestData.cardNo) params.cardNo = requestData.cardNo;
      if (requestData.cardHolder) params.cardHolder = requestData.cardHolder;
      if (requestData.expireMonth) params.expireMonth = requestData.expireMonth;
      if (requestData.expireYear) params.expireYear = requestData.expireYear;
      if (requestData.cvv) params.cvv = requestData.cvv;
    }

    console.log('📦 PowerPay 參數（簽名前）:', JSON.stringify(params, null, 2));

    // ===== 生成簽名 =====
    const filteredParams = {};
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
        filteredParams[key] = params[key];
      }
    });

    const sortedKeys = Object.keys(filteredParams).sort();
    const signString = sortedKeys
      .map(key => `${key}=${filteredParams[key]}`)
      .join('&') + `&key=${MD5_KEY}`;
    
    console.log('🔐 待簽名字符串:', signString);
    
    const sign = crypto
      .createHash('md5')
      .update(signString, 'utf8')
      .digest('hex')
      .toUpperCase();
    
    console.log('✅ 生成的簽名:', sign);
    
    filteredParams.sign = sign;

    // ===== 轉換為 form-urlencoded 格式 =====
    const formBody = Object.keys(filteredParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(filteredParams[key])}`)
      .join('&');

    console.log('🚀 調用 PowerPay API:', API_URL);
    console.log('📤 發送格式: application/x-www-form-urlencoded');
    console.log('📤 完整請求體:', formBody);

    // ===== 調用 PowerPay API（使用 form-urlencoded）=====
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: formBody,
    });

    const responseText = await response.text();
    console.log('📥 PowerPay 原始響應:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
      console.log('📥 PowerPay 響應 (JSON):', JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('❌ 解析響應失敗，返回原始文本');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          code: '99',
          msg: 'Invalid response from PowerPay',
          raw: responseText,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    console.error('❌ 堆疊:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
    };
  }
};
