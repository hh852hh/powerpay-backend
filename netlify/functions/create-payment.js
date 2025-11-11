const crypto = require('crypto');

const PAYMENT_CONFIG = {
  url: 'https://www.powerpayhk.com/hkpay/native/service',
  companyNo: '10088891',
  md5Key: process.env.POWERPAY_MD5_KEY || '94ed508f4bc242b88ddd0f0d644ebe7a',
  customerNo: {
    alipay: '606034480502001',
    unionpay: '572034480502002',
  },
  mcc: '8050'
};

function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function generateSignData(params) {
  const filtered = Object.entries(params)
    .filter(([k, v]) => v !== '' && v !== null && v !== undefined && k !== 'signData');
  
  const sorted = filtered.sort(([a], [b]) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  
  const str = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  const signStr = `${str}&key=${PAYMENT_CONFIG.md5Key}`;
  
  console.log('🔐 簽名生成:', signStr);
  
  return md5(signStr);
}

function getCustomerNo(payType) {
  return payType === 'UNIONPAY' ? PAYMENT_CONFIG.customerNo.unionpay : PAYMENT_CONFIG.customerNo.alipay;
}

function getService(payType) {
  if (payType === 'ALIPAY') return 'trade.jsPay';
  if (payType === 'UNIONPAY') return 'secure.pay';
  return 'trade.scanPay';
}

async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { orderNo, amount, subject, payType, frontUrl, notifyUrl, cardNo, expireMonth, expireYear, cvv, cardHolder } = body;

    if (!orderNo || !amount || !payType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          code: '99',
          error: 'Missing required parameters',
          msg: '缺少必需參數'
        }),
      };
    }

    console.log('📦 收到支付請求:', { orderNo, amount, payType });

    const service = getService(payType);
    const paymentRequest = {
      service,
      version: '1.0.0',
      companyNo: PAYMENT_CONFIG.companyNo,
      customerNo: getCustomerNo(payType),
      merOrderNo: orderNo,
      amount: amount.toString(),
      subject: (subject || `Order ${orderNo}`).slice(0, 32),
      desc: (subject || `Order ${orderNo}`).slice(0, 32),
      payType: payType === 'UNIONPAY' ? 'UNIONPAY_INTL' : payType,
      mcc: PAYMENT_CONFIG.mcc,
      timeExpire: '30',
      frontUrl: frontUrl || '',
      notifyUrl: notifyUrl || '',
      realIp: '127.0.0.1'
    };

    if (payType === 'ALIPAY') {
      paymentRequest.referUrl = frontUrl || '';
    }

    if (payType === 'UNIONPAY' && cardNo) {
      paymentRequest.cardNo = cardNo;
      if (expireMonth) paymentRequest.expireMonth = expireMonth;
      if (expireYear) paymentRequest.expireYear = expireYear;
      if (cvv) paymentRequest.cvv = cvv;
      if (cardHolder) paymentRequest.cardHolder = cardHolder;
    }

    paymentRequest.signData = generateSignData(paymentRequest);

    console.log('🚀 調用 PowerPay API:', PAYMENT_CONFIG.url);

    const response = await fetch(PAYMENT_CONFIG.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentRequest),
    });

    const responseText = await response.text();
    console.log('📥 PowerPay 響應:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ 解析響應失敗:', e);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          code: '99',
          msg: 'Invalid response from payment gateway',
          error: 'Parse error'
        }),
      };
    }

    console.log('✅ PowerPay 響應 (JSON):', data);

    if (data.code === '00') {
      if (service === 'secure.pay' && data.data) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ...data,
            html: data.data,
          }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data),
      };
    }

    console.error('❌ PowerPay 錯誤:', data);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('💥 處理異常:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        code: '99',
        error: 'Internal server error',
        msg: error.message,
      }),
    };
  }
}

exports.handler = handler;
