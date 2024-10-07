
function getEnumKeys<T extends {[k :string] :unknown}> (enumObj :T) { return Object.keys(enumObj).filter(key=>isNaN(+key)) as readonly(keyof T)[]; }  // remove numbers

enum __enumPermission {
    SPOT,
    MARGIN,
    LEVERAGED,
    TRD_GRP_002,
    TRD_GRP_003,
    TRD_GRP_004,
    TRD_GRP_005,
    TRD_GRP_006,
    TRD_GRP_007,
    TRD_GRP_008,
    TRD_GRP_009,
    TRD_GRP_010,
    TRD_GRP_011,
    TRD_GRP_012,
    TRD_GRP_013,
    TRD_GRP_014,
    TRD_GRP_015,
    TRD_GRP_016,
    TRD_GRP_017,
    TRD_GRP_018,
    TRD_GRP_019,
    TRD_GRP_020,
    TRD_GRP_021,
    TRD_GRP_022,
    TRD_GRP_023,
    TRD_GRP_024,
    TRD_GRP_025
}

export const Permission = getEnumKeys(__enumPermission);


enum __enumOCOStatus { RESPONSE, EXEC_STARTED, ALL_DONE }

export const OCOStatus = getEnumKeys(__enumOCOStatus);


enum __enumOCOOrderStatus { EXECUTING, ALL_DONE, REJECT};

export const OCOOrderStatus = getEnumKeys(__enumOCOOrderStatus);


export const WorkingFloor = ["EXCHANGE", "SOR"] as const;


enum __enumOrderTypes {
    LIMIT,
    MARKET,
    STOP_LOSS,
    STOP_LOSS_LIMIT,
    TAKE_PROFIT,
    TAKE_PROFIT_LIMIT,
    LIMIT_MAKER,
}

export const OrderType = getEnumKeys(__enumOrderTypes);


export const OrderResponseType = ["ACK", "RESULT", "FULL"] as const


export const OrderSide = ["BUY", "SELL"] as const;

export const PositionSide = ["BOTH", "LONG", "SHORT"] as const;


enum __enumOrderStatus {
    NEW,
    PARTIALLY_FILLED,
    FILLED,
    CANCELED,
    PENDING_CANCEL,
    REJECTED,
    EXPIRED,
    EXPIRED_IN_MATCH
}

export const OrderStatus = getEnumKeys(__enumOrderStatus);

export const WorkingType = ["MARK_PRICE", "CONTRACT_PRICE"] as const;


export const TimeInForce = ["GTC", "IOC", "FOC"] as const;


export const RateLimitType = ["REQUEST_WEIGHT", "ORDERS", "RAW_REQUESTS"] as const;

export const RateLimitInterval = ["SECOND", "MINUTE", "DAY"] as const;


enum __enumPriceMatch {NONE, OPPONENT, OPPONENT_5, OPPONENT_10, OPPONENT_20, QUEUE, QUEUE_5, QUEUE_10, QUEUE_20 };

export const PriceMatch = getEnumKeys(__enumPriceMatch);