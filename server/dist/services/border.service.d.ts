export interface CheckpointDefinition {
    name: string;
    alertLevel: number;
    scannerType: 'VISUAL' | 'XRAY' | 'K9';
    hasK9: boolean;
}
export declare class BorderService {
    /**
     * Main mathematical risk and clearance engine
     */
    static calculateClearance(truckId: string, checkpoint: CheckpointDefinition): Promise<{
        cleared: boolean;
        roll: number;
        detectionProbability: number;
        penalties?: {
            bustedContraband: boolean;
            fineAmount: number;
            reputationLoss: number;
            policeHeatIncrease: number;
            impoundDays: number;
        };
    }>;
    /**
     * Applies the penalties inside an ACID transaction
     */
    static applyBustPenalties(truckId: string, penalties: {
        fineAmount: number;
        reputationLoss: number;
        policeHeatIncrease: number;
        impoundDays: number;
    }): Promise<void>;
    /**
     * Processes successful clearance payouts
     */
    static applyClearanceSuccess(truckId: string): Promise<{
        payout: number;
    }>;
    /**
     * Processes an interactive bribe attempt
     */
    static applyBribeAttempt(truckId: string, bribeAmount: number): Promise<{
        success: boolean;
        roll: number;
        chance: number;
        payout?: number;
        penalties?: any;
    }>;
    /**
     * Processes a breakthrough run attempt
     */
    static applyBorderRun(truckId: string): Promise<{
        success: boolean;
        roll: number;
        chance: number;
        damagePercent?: number;
        payout?: number;
        penalties?: any;
    }>;
}
