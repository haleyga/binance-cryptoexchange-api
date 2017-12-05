import * as axiosDefault from 'axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import * as qs from 'qs';

/**
 * Just an alias.
 */
const axios = axiosDefault.default;

/**
 * Default configuration.
 */
const defaultConfig = {
    rootUrl: `https://api.binance.com`,
    timeout: 3000,
    version: 'v3',
};

/**
 * Default HTTP agent configuration.
 */
const defaultAgentConfig = {
    baseURL: defaultConfig.rootUrl,
    headers: {
        'Cache-Control' : 'no-cache',
        'Content-Length': 0,
        'Content-Type'  : 'text/plain',
        'User-Agent'    : `Binance API Client (binance-cryptoexchange-api node package)`,
    },
    method : 'GET',
    timeout: defaultConfig.timeout,
};

/**
 * The public agent is essentially an alias for the default configuration.
 *
 * @type {{}}
 */
const publicAgentConfig = {
    ...defaultAgentConfig,
};

/**
 * The private agent begins life the same as the public agent, but with 'POST' specified.
 *
 * @type {{method: string}}
 */
const privateAgentConfig = {
    ...defaultAgentConfig,
    method: 'POST',
};

/**
 * The post body shape.
 */
export interface IPostBody {
    [key: string]: string | number | boolean;
}

/**
 * This function is exported so that a user can experiment with/understand how Binance wants requests to be signed.
 * Essentially, for user edification ;).
 *
 * @param {string} path
 * @param {{}} postData
 * @param {string} secret
 * @returns {ISignature}
 */
export const signMessage = (postData: IPostBody, secret: string): ISignature => {
    //tslint:disable:no-magic-numbers
    const timestamp = Date.now();
    //tslint:enable:no-magic-numbers

    const signedBody = { ...postData, timestamp };
    const digest     = crypto.createHmac('sha256', secret)
                             .update(qs.stringify(signedBody))
                             .digest('hex');

    const body = { ...signedBody, signature: digest };

    return { body, digest };
};

export interface ISignature {
    digest: string;
    body: IPostBody;
}

/**
 * Convenient container for API keys.
 */
export interface IApiAuth {
    publicKey: string;
    privateKey: string;
}

/**
 * The shape of a Binance client.
 */
export interface IRawAgent {
    auth?: IApiAuth;

    isUpgraded(): boolean;

    publicRequest(endpoint: string, queryParams?: {}): Promise<IBinanceResponse>;

    privateRequest(endpoint: string, method: string, data?: IPostBody): Promise<IBinanceResponse>;

    signMessage(postData: IPostBody, secret: string): ISignature;

    upgrade(newAuth: IApiAuth): void;
}

/**
 * Factory function to get an agent.
 *
 * @param {IApiAuth} auth
 * @returns {IRawAgent}
 */
export const getRawAgent = (auth?: IApiAuth): IRawAgent => ({

    /**
     * This holds the user's API keys.
     */
    auth,

    /**
     * Fetches data from public (unauthenticated) endpoints.
     *
     * @param {string} endpoint
     * @param {{}} queryParams
     * @param configOverride
     * @returns {Promise<IBinanceResponse>}
     */
    async publicRequest(endpoint: string,
                        queryParams?: {},
                        configOverride?: IBinanceRequestConfig): Promise<IBinanceResponse> {

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        // The uri is a relative path to the publicAgentConfig#baseUrl
        const uri = `/${endpoint}?${qs.stringify(queryParams)}`;

        // Construct the actual config to be used
        const agentConfig = { ...publicAgentConfig, url: uri, ...config };

        // Send the request.
        const response = await axios(agentConfig);

        // Finally, return the response
        return Promise.resolve(response);
    },

    /**
     * Checks if the user has supplied API keys.
     *
     * @returns {boolean}
     */
    isUpgraded(): boolean { return this.auth; },

    /**
     * Posts to private (authenticated) endpoints.  If no API keys have been provided, this function will fail.
     *
     * @param {string} endpoint
     * @param method
     * @param params
     * @param configOverride
     * @returns {Promise<IBinanceResponse>}
     */
    async privateRequest(endpoint: string,
                         method: string,
                         params?: IPostBody,
                         configOverride?: IBinanceRequestConfig): Promise<IBinanceResponse> {

        // Ensure the user has credentials
        if (!this.isUpgraded()) return Promise.reject(`api keys are required to access private endpoints`);

        // Construct local config object
        const config = { ...defaultConfig, ...configOverride };

        const signatureData = signMessage(params, this.auth.privateKey);

        const headersOverride = config.headers || null;

        // Add the appropriate POST request headers (Key and Sign)
        const headers = {
            ...privateAgentConfig.headers,
            'X-MBX-APIKEY': this.auth.publicKey,
            ...headersOverride,
        };

        const data     = signatureData.body;
        const postData = method === 'GET' ? null : data;

        // The uri is a relative path to the privateAgentConfig,baseUrl
        const uri = method === 'GET' ? `/${endpoint}?${qs.stringify(data)}` : `/${endpoint}`;

        // Construct the actual config to be used
        const agentConfig = { ...privateAgentConfig, headers, method, url: uri, data: postData, ...config };

        try {
            const response = await axios(agentConfig);

            // Finally, send the request and return the response
            return Promise.resolve(response);
        } catch (err) {
            const rejectionReason = err.response.data.error || err.response.data || err.response || err;

            return Promise.reject(rejectionReason);
        }
    },

    /**
     * Include the exported #signMessage function for convenience.
     */
    signMessage,

    /**
     * Upgrades a client with new credentials.
     *
     * @param {IApiAuth} newAuth
     */
    upgrade(newAuth: IApiAuth): void { this.auth = newAuth; },
});

export type ITimeResult = {
    serverTime: number;
}

// the last element in the array may be ignored (according to Binance docs...)
// [ price, qantity, []]
export type IEntryResult = [string, string, {}[]];

export type IOrderBookResult = {
    lastUpdateId: number;
    bids: IEntryResult[];
    asks: IEntryResult[];
};

export type IAggTradesResult = {
    a: number;         // Aggregate tradeId
    p: string;  // Price
    q: string;  // Quantity
    f: number;         // First tradeId
    l: number;         // Last tradeId
    T: number; // Timestamp
    m: boolean;          // Was the buyer the maker?
    M: boolean;           // Was the trade the best price match?
};

export type ICandleResult = [
    number,      // Open time
    string,       // Open
    string,       // High
    string,       // Low
    string,       // Close
    string,  // Volume
    number,      // Close time
    string,    // Quote asset volume
    number,                // Number of trades
    string,    // Taker buy base asset volume
    string,      // Taker buy quote asset volume
    string // Can be ignored
    ];

export type I24HourStatsResult = {
    priceChange: string,
    priceChangePercent: string,
    weightedAvgPrice: string,
    prevClosePrice: string,
    lastPrice: string,
    bidPrice: string,
    askPrice: string,
    openPrice: string,
    highPrice: string,
    lowPrice: string,
    volume: string,
    openTime: number,
    closeTime: number,
    fristId: number,   // First tradeId
    lastId: number,    // Last tradeId
    count: number         // Trade count
};

export type ILastPriceResult = {
    symbol: string,
    price: string,
};

export type ITickerResult = {
    symbol: string;
    bidPrice: string;
    bidQty: string;
    askPrice: string;
    askQty: string;
};

export type IOrderResult = {
    symbol: string;
    orderId: number;
    clientOrderId: string;
    price: string;
    origQty: string;
    executedQty: string;
    status: string;
    timeInForce: string;
    type: string;
    side: string;
    stopPrice: string;
    icebergQty: string;
    time: number;
};

export type ICancelOrderResult = {
    symbol: string;
    origClientOrderId: string;
    orderId: number;
    clientOrderId: string;
};

export type ITradeResult = {
    id: number;
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
    time: number;
    isBuyer: boolean;
    isMaker: boolean;
    isBestMatch: boolean;
};

export type IWithdrawRequestResult = {
    msg: string;
    success: boolean;
    id: string;
};

export type ITransactionResult = {
    insertTime: number;
    amount: number;
    asset: string;
    address: string;
    addressTag: string;
    txId: string;
    status: number;
};

export type IDepositHistoryResult = {
    depositList: ITransactionResult[];
    success: boolean;
};

export type IWithdrawalHistoryResult = {
    withdrawList: ITransactionResult[];
    success: boolean;
};

export type IGetDepositAddressResult = {
    address: string;
    success: boolean;
    addressTag: string;
    asset: string;
};

export interface IBinanceClient {
    rawAgent: IRawAgent;

    isUpgraded(): boolean;

    upgrade(auth: IApiAuth): void;

    ping(): Promise<IBinanceResponse>;

    getServerTime(): Promise<IBinanceResponse>;

    getOrderBook(params: IGetOrderBookParams): Promise<IBinanceResponse>;

    getAggregateTradesList(params: IGetAggTradesParams): Promise<IBinanceResponse>;

    getCandles(params: IGetCandlesParams): Promise<IBinanceResponse>;

    get24HourStats(symbolId: string): Promise<IBinanceResponse>;

    getPrices(): Promise<IBinanceResponse>;

    getTickerTape(): Promise<IBinanceResponse>;

    placeNewOrder(params: INewOrderParams): Promise<IBinanceResponse>;

    placeNewTestOrder(params: INewOrderParams): Promise<IBinanceResponse>;

    getOrder(params: IGetOrderParams): Promise<IBinanceResponse>;

    cancelOrder(params: ICancelOrderParams): Promise<IBinanceResponse>;

    getOpenOrders(tradingSymbol: string): Promise<IBinanceResponse>;

    getAllOrders(params: IGetAllOrdersParams): Promise<IBinanceResponse>;

    getAccountInformation(): Promise<IBinanceResponse>;

    getAccountTradeList(params: IGetTradesParams): Promise<IBinanceResponse>;

    requestCryptoWithdrawal(params: IWithdrawRequestParams): Promise<IBinanceResponse>;

    getWithdrawalHistory(params: IGetWithdrawalDepositHistoryParams): Promise<IBinanceResponse>;

    getDepositHistory(params: IGetWithdrawalDepositHistoryParams): Promise<IBinanceResponse>;

    getDepositAddress(symbolId: string): Promise<IBinanceResponse>;
}

export type IGetOrderBookParams = {
    symbol: string;
    limit?: number;
};

export type IGetAggTradesParams = {
    symbol: string;
    fromId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
};

export type IGetCandlesParams = {
    symbol: string;
    interval: string;
    limit?: number;
    startTime?: number;
    endTime?: number;
};

export type INewOrderParams = {
    symbol: string;
    side: string;
    type: string;
    timeInForce: string;
    quantity: number;
    price: number;
    newClientOrderId?: string;
    stopPrice?: number;
    icebergQty?: number;
};

export type IGetOrderParams = {
    symbol: string;
    orderId?: number;
    origClientOrderId?: string;
};

export type ICancelOrderParams = {
    symbol: string;
    orderId?: number;
    origClientOrderId?: string;
    newClientOrderId?: string;
};

export type IGetAllOrdersParams = {
    symbol: string;
    orderId?: number;
    limit?: number;
};

export type IGetTradesParams = {
    symbol: string;
    limit?: number;
    fromId?: number;
};

export type IWithdrawRequestParams = {
    asset: string;
    address: string;
    addressTag?: string;
    amount: number;
    name?: string;
};

export type IGetWithdrawalDepositHistoryParams = {
    asset: string;
    status?: number;
    startTime?: number;
    endTime?: number;
};

export const getClient = (auth?: IApiAuth, configOverride: IBinanceRequestConfig = null): IBinanceClient => ({
    rawAgent: getRawAgent(auth),

    isUpgraded(): boolean { return this.rawAgent.isUpgraded(); },

    upgrade(newAuth: IApiAuth): void { return this.rawAgent.upgrade(newAuth); },

    //<editor-fold desc="market data">

    async ping(): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/ping', null, configOverride);
    },

    async getServerTime(): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/time', null, configOverride);
    },

    async getOrderBook(params: IGetOrderBookParams): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/depth', params, configOverride);
    },

    async getAggregateTradesList(params: IGetAggTradesParams): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/aggTrades', params, configOverride);
    },

    async getCandles(params: IGetCandlesParams): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/klines', params, configOverride);
    },

    async get24HourStats(symbolId: string): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/ticker/24hr', { symbol: symbolId }, configOverride);
    },

    async getPrices(): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/ticker/allPrices', null, configOverride);
    },

    async getTickerTape(): Promise<IBinanceResponse> {
        return this.rawAgent.publicRequest('api/v1/ticker/allBookTickers', null, configOverride);
    },

    //</editor-fold>

    //<editor-fold desc="accounts and trading">

    async placeNewOrder(params: INewOrderParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest('api/v3/order', 'POST', params, configOverride);
    },

    async placeNewTestOrder(params: INewOrderParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest('api/v3/order/test', 'POST', params, configOverride);
    },

    async getOrder(params: IGetOrderParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest('api/v3/order', 'GET', params, configOverride);
    },

    async cancelOrder(params: ICancelOrderParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest('api/v3/order', 'DELETE', params, configOverride);
    },

    async getOpenOrders(tradingSymbol: string): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest('api/v3/openOrders', 'GET', { symbol: tradingSymbol }, configOverride);
    },

    async getAllOrders(params: IGetAllOrdersParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest('api/v3/allOrders', 'GET', params, configOverride);
    },

    async getAccountInformation(): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest(`api/v3/account`, 'GET', null, configOverride);
    },

    async getAccountTradeList(params: IGetTradesParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest(`api/v3/myTrades`, 'GET', params, configOverride);
    },

    async requestCryptoWithdrawal(params: IWithdrawRequestParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest(`wapi/v3/withdraw.html`, 'POST', params, configOverride);
    },

    async getDepositHistory(params: IGetWithdrawalDepositHistoryParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest(`wapi/v3/depositHistory.html`, 'GET', params, configOverride);
    },

    async getWithdrawalHistory(params: IGetWithdrawalDepositHistoryParams): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest(`wapi/v3/withdrawHistory.html`, 'GET', params, configOverride);
    },

    async getDepositAddress(symbolId: string): Promise<IBinanceResponse> {
        return this.rawAgent.privateRequest(`wapi/v3/depositAddress.html`, 'GET', { asset: symbolId }, configOverride);
    },
});

/**
 * Alias for Axios request options.
 */
export interface IBinanceRequestConfig extends AxiosRequestConfig {}

/**
 * Alias for Axios response.
 */
export interface IBinanceResponse extends AxiosResponse {}
