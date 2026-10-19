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
  });
  button.textContent=label(auth.currentUser);
}
