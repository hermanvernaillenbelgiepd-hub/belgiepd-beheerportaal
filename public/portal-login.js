// All pages use the same Firebase Auth project and same-origin browser
// persistence. The server validates privileges independently on every request.
export function setupPortalLogin({button,auth,authModule,config,onError}){
  if(!button||!auth||!authModule)throw Error('Portaallogin kan niet starten');
  const discordReady=config?.discordPortalLoginReady===true;
  const label=user=>user?'Afmelden':discordReady?'Aanmelden met Discord':'Google aanmelden';
  const notify=e=>onError?.(e instanceof Error?e:new Error(String(e)));
  const google=async()=>{
    await authModule.setPersistence(auth,authModule.browserLocalPersistence);
    await authModule.signInWithPopup(auth,new authModule.GoogleAuthProvider());
  };
  button.onclick=async()=>{
    try{
      if(auth.currentUser){await authModule.signOut(auth);return}
      if(discordReady){
        const safeReturn=location.pathname;
        location.assign('/auth/discord/start?return='+encodeURIComponent(safeReturn));
        return;
      }
      await google();
    }catch(e){notify(e)}
  };
  let refresh;
  if(discordReady){
    refresh=document.createElement('button');
    refresh.type='button';
    refresh.textContent='Discord opnieuw verifiëren';
    refresh.title='Vernieuw je Discord-serververificatie zonder eerst af te melden';
    refresh.style.marginInlineStart='8px';
    refresh.onclick=()=>location.assign('/auth/discord/start?return='+encodeURIComponent(location.pathname));
    button.insertAdjacentElement('afterend',refresh);
  }
  let fallback;
  if(discordReady){
    fallback=document.createElement('button');
    fallback.type='button';
    fallback.className=button.className;
    fallback.textContent='Google-noodlogin';
    fallback.title='Gebruik je bestaande goedgekeurde Google-account als noodtoegang';
    fallback.style.marginInlineStart='8px';
    fallback.onclick=async()=>{try{await google()}catch(e){notify(e)}};
    button.insertAdjacentElement('afterend',fallback);
  }
  authModule.onAuthStateChanged(auth,user=>{
    button.textContent=label(user);
    if(fallback)fallback.hidden=Boolean(user);
    if(refresh)refresh.hidden=!(user && typeof user.uid==='string' && user.uid.startsWith('discord:'));
  });
  button.textContent=label(auth.currentUser);
}
