// TEST mapping requested by BelgiumPD (2026-10-21).
// This mapping identifies intended recipients, but NEVER grants a police role,
// Firestore permissions or elevated portal access. Server-approved actor roles remain mandatory.
// Confirmed by portal owner: Jones, Roy, J.Eclaire and Seba belong to series 03.
// Dieter (series 01) and Unemi (series 02) are distinct people; they were
// supplied with the SAME Discord ID 947114717724413952. Exclude that ID
// from both series until each correct identity is independently confirmed.
export const VERIFIED_SERIES_HEADS=Object.freeze({
  '1':Object.freeze([
    '622486684033875968', // Yassine
    '1041812771349737614', // Brayan
    '949115181785563137', // Isaiah
    '962410307463049236' // Mxxx_
  ]),
  '2':Object.freeze([
    '729410384095871098', // Anvar
    '305021081243090944' // Sir-Robin
  ]),
  '3':Object.freeze([
    '1103170819355574328', // Jones
    '1222286882331824208', // Roy
    '344065695635734528', // J.Eclaire
    '1171128215708909602' // Seba
  ])
});
export const AMBIGUOUS_DISCORD_ID='947114717724413952';
export const BUTTERFLY_DISCORD_ID='528568826481344522'; // Rx
// Named leadership IDs are non-authoritative until independently approved by
// the existing identity + role management flow.
export const PROPOSED_LEADERSHIP=Object.freeze({
  officers:Object.freeze(['441227830400122882','505659510359064606']),
  chiefs:Object.freeze(['342343001630179329','474301150188011540'])
});
