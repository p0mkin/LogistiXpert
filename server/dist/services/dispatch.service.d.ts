export declare class DispatchSimulationService {
    private static isRunning;
    private static intervalId;
    private static TICK_INTERVAL_MS;
    /**
     * Starts the main background simulation loop
     */
    static startTicker(): void;
    /**
     * Main simulation processing cycle
     */
    private static processSimulationTick;
    /**
     * Safely shuts down the background loop
     */
    static stopTicker(): void;
}
