export type UserPreference = {
  dashboardInterval: number;
  brokerStatusInterval: number;
  /** Seconds between the service dashboard's volume usage reads; 0 = only on refresh. */
  serviceVolumeInterval?: number;
};
