import express from 'express';

// Register before the observation routes. These submissions are private,
// intentionally small, and must be parsed before Discord-ID validation.
export const basicObservationJsonParser=express.json({limit:'12kb',strict:true});
