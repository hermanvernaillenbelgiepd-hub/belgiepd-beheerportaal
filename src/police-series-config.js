// TEST mapping requested by BelgiumPD (2026-10-21).
// This mapping identifies intended recipients, but NEVER grants a police role,
// Firestore permissions or elevated portal access. Server-approved actor roles remain mandatory.
// Third set of heads was labeled "REEKS 02" a second time; temporarily treated
// as *unconfirmed*, NOT assigned to series 3 until confirmed.
// Discord 947114717724413952 was supplied for both Dieter and Unemi:
// exclude it from automatic routing until the identity is clarified.
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
  '3':Object.freeze([]) // Confirmation required from owner.
});
export const PROVISIONAL_THIRD_GROUP=Object.freeze([
  '1103170819355574328', // Jones
  '1222286882331824208', // Roy
  '344065695635734528', // J.Eclaire
  '1171128215708909602' // Seba
]);
export const AMBIGUOUS_DISCORD_ID='947114717724413952';
export const BUTTERFLY_DISCORD_ID='528568826481344522'; // Rx
// Named leadership IDs are non-authoritative until independently approved by
// the existing identity + role management flow.
export const PROPOSED_LEADERSHIP=Object.freeze({
  officers:Object.freeze(['441227830400122882','505659510359064606']),
  chiefs:Object.freeze(['342343001630179329','474301150188011540'])
});
