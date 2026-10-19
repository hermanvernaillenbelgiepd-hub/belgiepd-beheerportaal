// TESTSERVER ONLY. This adapter must never run against production data.
// It does not change portal/Firestore permissions for any other module.
export function personnelTestActor(actor,env){
  if(env.BPD_TEST_FIXTURES!=='true'||env.FIREBASE_PROJECT_ID!=='belgiepd-test'||
     typeof env.BPD_TEST_PERSONNEL_EDITOR_DISCORD_ID!=='string'||
     !/^\d{15,22}$/.test(env.BPD_TEST_PERSONNEL_EDITOR_DISCORD_ID)||
     actor?.discordId!==env.BPD_TEST_PERSONNEL_EDITOR_DISCORD_ID||
     !Array.isArray(actor?.departments)||!actor.departments.includes('politie'))return actor;
  return {...actor,
    role:'officierenkader',
    departments:['politie'],
    departmentRoles:{politie:'officierenkader'},
    personnelTestMode:true};
}
