"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = void 0;
const zod_1 = require("zod");
/**
 * Validates request body, query, or params against a Zod schema
 */
const validateRequest = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            return next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                return res.status(400).json({
                    error: 'VALIDATION_FAILED',
                    message: 'Invalid request parameters.',
                    details: error.errors.map((err) => ({
                        field: err.path.join('.'),
                        message: err.message,
                    })),
                });
            }
            return res.status(500).json({ error: 'SERVER_ERROR', message: 'Validation process failed.' });
        }
    };
};
exports.validateRequest = validateRequest;
