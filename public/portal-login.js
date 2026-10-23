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
  // A Google login must not hide the Discord login option. Changing the
  // login provider is deliberate; the server still checks every access right.
  let refresh;
  if(discordReady){
    refresh=document.createElement('button');
    refresh.type='button';
    refresh.textContent='Aanmelden met Discord';
    refresh.title='Verbind of vernieuw je eigen Discord-serververificatie';
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
    if(refresh){
      refresh.hidden=!user;
      refresh.textContent=user?.uid?.startsWith('discord:')?
        'Discord opnieuw verifiëren':'Aanmelden met Discord';
    }
  });
  button.textContent=label(auth.currentUser);
}
