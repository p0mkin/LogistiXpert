declare const router: import("express-serve-static-core").Router;
export interface PartsCatalogItem {
    id: string;
    name: string;
    category: 'MAINTENANCE' | 'RIGGING';
    cost: number;
    currency: 'LEGAL' | 'BLACK_MARKET';
    description: string;
}
export default router;
