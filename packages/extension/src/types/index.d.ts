type SignaliumMessageType = 'STATE_UPDATE_FROM_PAGE';

export interface SignaliumMessage {
  type: SignaliumMessageType;
  timestamp: string;
  data: {
    source: string;
  };
  payload: {
    state: string;
  };
}
