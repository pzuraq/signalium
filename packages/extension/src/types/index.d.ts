type SignaliumMessageType = 'STATE_UPDATE_FROM_PAGE';

export interface SignaliumMessage {
  type: SignaliumMessageType;
  source: string;
  payload: {
    id: string;
    timestamp: number;
    type: string;
  };
}
