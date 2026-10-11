const mineflayer = require('mineflayer');
const readline = require('readline');

// Konfiguracja - priorytetowo minokalira1 i minokalira2, potem reszta z dozwolonej listy
const BOT_NAMES = ['minokalira1', 'minokalira2', 'minokalira3', 'marek3'];
const HOST = 'rgmc.pl';
const AUTHORIZED_PLAYER = 'Dylirzans17'; // TYLKO TEN GRACZ MOŻE STEROWAĆ BOTAMI

const bots = {};
let pendingLogs = [];
let logTimer = null;

function flushLogs() {
  if (pendingLogs.length === 0) return;

  const counts = {};
  for (const log of pendingLogs) {
    counts[log] = (counts[log] || 0) + 1;
  }

  for (const [msg, count] of Object.entries(counts)) {
    if (count > 1) {
      console.log(`[SERWER x${count}]: ${msg}`);
    } else {
      console.log(`[SERWER]: ${msg}`);
    }
  }

  pendingLogs = [];
  logTimer = null;
}

function queueLog(msg) {
  pendingLogs.push(msg);
  if (!logTimer) {
    logTimer = setTimeout(flushLogs, 80);
  }
}

function startShoppingAll() {
  console.log('[SYSTEM]: Uruchamiam pętlę kupowania spawnerów dla wszystkich botów!');
  Object.values(bots).forEach(bot => {
    if (bot && bot._client && bot._client.chat) {
      bot.isShopping = true;
      bot.triggerShop();
    }
  });
}

function stopShoppingAll() {
  console.log('[SYSTEM]: Zatrzymuję pętlę kupowania!');
  Object.values(bots).forEach(bot => {
    if (bot) {
      bot.isShopping = false;
      bot.shopStep = 0;
      if (bot.clearStuckTimer) bot.clearStuckTimer();
    }
  });
}

function dropAllForPlayer(targetNick) {
  console.log(`[SYSTEM]: Rozkaz wyrzucenia eq dla gracza: ${targetNick}`);
  Object.values(bots).forEach(bot => {
    if (bot && bot._client) {
      bot.dropAllToPlayer(targetNick);
    }
  });
}

function grantPermissionsAll(targetNick) {
  console.log(`[SYSTEM]: Wszystkie boty wysyłają /permissions ${targetNick}`);
  Object.values(bots).forEach(bot => {
    if (bot && bot._client && bot._client.chat) {
      bot.chat(`/permissions ${targetNick}`);
    }
  });
}

function triggerDistribute() {
  const distributor = bots['minokalira3'] || Object.values(bots)[0];
  if (distributor && distributor._client && distributor._client.chat) {
    console.log(`[SYSTEM]: ${distributor.username} sprawdza saldo (/bal), aby rozdzielić pieniądze...`);
    distributor.isCheckingBalance = true;
    distributor.chat('/bal');
  } else {
    console.log('[SYSTEM]: Brak aktywnego bota do rozdzielenia funduszy!');
  }
}

function createMultiBot(username) {
  console.log(`[SYSTEM]: Inicjalizacja bota ${username}...`);
  
  const bot = mineflayer.createBot({
    host: HOST,
    username: username
  });

  bots[username] = bot;

  let authDone = false;
  let actionTaken = false;
  let isReconnecting = false;
  
  bot.isShopping = false;
  bot.shopStep = 0;
  bot.stuckTimer = null;
  bot.isCheckingBalance = false;

  bot.clearStuckTimer = () => {
    if (bot.stuckTimer) {
      clearTimeout(bot.stuckTimer);
      bot.stuckTimer = null;
    }
  };

  const resetStuckProtection = () => {
    bot.clearStuckTimer();
    if (bot.isShopping) {
      bot.stuckTimer = setTimeout(() => {
        if (bot.isShopping) {
          console.log(`[${username}]: Wykryto zacięcie GUI! Restartuję pętlę /shop...`);
          bot.triggerShop();
        }
      }, 3000);
    }
  };

  const scheduleReconnect = (reason) => {
    if (isReconnecting) return;
    isReconnecting = true;
    bot.clearStuckTimer();
    delete bots[username];
    console.log(`[${username}]: Rozłączono (${reason}). Ponowne łączenie za 5 sekund...`);
    
    setTimeout(() => {
      createMultiBot(username);
    }, 5000);
  };

  bot.on('spawn', () => {
    console.log(`[SYSTEM]: Bot ${username} dołączył do serwera.`);
    authDone = false;
    actionTaken = false;
    bot.isShopping = false;
    bot.shopStep = 0;
    bot.clearStuckTimer();
  });

  bot.triggerShop = () => {
    if (!bot.isShopping) return;
    bot.shopStep = 1;
    resetStuckProtection();
    if (bot._client && bot._client.chat) {
      bot.chat('/shop');
    }
  };

  bot.dropAllToPlayer = async (targetNick) => {
    const target = bot.players[targetNick] ? bot.players[targetNick].entity : null;

    if (!target) {
      console.log(`[${username}]: Nie znaleziono gracza ${targetNick} w pobliżu!`);
      return;
    }

    const dist = bot.entity.position.distanceTo(target.position);
    if (dist > 10) {
      console.log(`[${username}]: Gracz ${targetNick} jest za daleko (${dist.toFixed(1)}m)!`);
      return;
    }

    console.log(`[${username}]: Wyrzucam eq dla ${targetNick}...`);
    await bot.lookAt(target.position.offset(0, target.height, 0));

    const items = bot.inventory.items();
    for (const item of items) {
      try {
        await bot.tossStack(item);
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {}
    }
    console.log(`[${username}]: Wyrzucono ekwipunek!`);
  };

  bot.on('message', (message) => {
    const text = message.toString().trim();
    if (!text) return;

    queueLog(text);

    // Parsowanie salda /bal dla minokalira3
    if (username === 'minokalira3' && bot.isCheckingBalance && (text.includes('stan konta') || text.includes('Twoje konto') || text.includes('$'))) {
      const match = text.match(/\$\s*([\d,]+(\.\d+)?)/);
      if (match && match[1]) {
        const rawAmount = match[1].replace(/,/g, '');
        const totalBalance = Math.floor(parseFloat(rawAmount));

        if (!isNaN(totalBalance) && totalBalance > 0) {
          bot.isCheckingBalance = false;
          console.log(`[${username}]: Wykryto saldo: $${totalBalance.toLocaleString()}`);

          const usableBalance = totalBalance - 1000;
          if (usableBalance <= 0) {
            console.log(`[${username}]: Za mało środków na koncie do rozdzielenia!`);
            return;
          }

          const share = Math.floor(usableBalance / BOT_NAMES.length);
          console.log(`[${username}]: Dzielę $${usableBalance.toLocaleString()} na części. Każdy dostaje: $${share.toLocaleString()}`);

          BOT_NAMES.forEach(targetBotName => {
            if (targetBotName !== username) {
              console.log(`[${username}]: Wysyłam /pay ${targetBotName} ${share}`);
              bot.chat(`/pay ${targetBotName} ${share}`);
            }
          });
        }
      }
    }

    // REAKCJA NA KOMENDY Z CZATU - ŚCISŁA WERYFIKACJA GRACZA (TYLKO Dylirzans17)
    if (text.includes(AUTHORIZED_PLAYER)) {
      if (text.includes('!start') || text.includes('@start') || text.includes('#start')) {
        startShoppingAll();
      }

      if (text.includes('!stop') || text.includes('@stop') || text.includes('#stop')) {
        stopShoppingAll();
      }

      if (text.includes('rozdziel all') || text.includes('rodziel all')) {
        triggerDistribute();
      }

      if (text.includes('permissions all') || text.includes('perm all')) {
        const parts = text.split(/\s+/);
        const targetNick = parts[parts.length - 1];
        if (targetNick && targetNick !== 'all') {
          grantPermissionsAll(targetNick);
        }
      }

      if (text.includes('!drop') || text.includes('@drop') || text.includes('#drop')) {
        const parts = text.split(/\s+/);
        const dropIndex = parts.findIndex(p => p.includes('!drop') || p.includes('@drop') || p.includes('#drop'));
        if (dropIndex !== -1 && parts[dropIndex + 1]) {
          dropAllForPlayer(parts[dropIndex + 1]);
        }
      }
    }

    // Auto-register / login & kompas
    if ((text.includes('Zaloguj się aby otrzymać dostęp do lobby') || text.includes('Zarejestruj się aby otrzymać dostęp do lobby')) && !authDone) {
      authDone = true;
      console.log(`[${username}]: Logowanie / Rejestracja...`);
      
      setTimeout(() => {
        if (text.includes('Zarejestruj się')) {
          if (bot._client && bot._client.chat) bot.chat('/register 123123w 123123w');
        }
        
        setTimeout(() => {
          if (bot._client && bot._client.chat) bot.chat('/login 123123w');
          
          setTimeout(async () => {
            if (!actionTaken) {
              actionTaken = true;
              try {
                const compassItem = bot.inventory.items().find(item => item && item.name.includes('compass'));
                if (compassItem) {
                  if (compassItem.slot >= 36 && compassItem.slot <= 44) {
                    bot.setQuickBarSlot(compassItem.slot - 36);
                  } else {
                    await bot.equip(compassItem, 'hand');
                  }
                  setTimeout(() => {
                    bot.activateItem();
                    bot.swingArm('right');
                  }, 500);
                } else {
                  bot.activateItem();
                }
              } catch (err) {}
            }
          }, 3500);

        }, 1000);
        
      }, 3000);
    }
  });

  // Obsługa GUI (szukanie żelaznej motyki - iron_hoe)
  bot.on('windowOpen', (window) => {
    setTimeout(() => {
      if (!bot.currentWindow) return;

      const hoeItem = bot.currentWindow.slots.find(item => item && item.name.includes('iron_hoe'));
      if (hoeItem && !bot.isShopping) {
        bot.clickWindow(hoeItem.slot, 0, 0).catch(err => {});
        return;
      }
    }, 300);

    if (bot.isShopping) {
      resetStuckProtection();
      
      setTimeout(async () => {
        if (!bot.currentWindow) return;

        if (bot.shopStep === 1) {
          bot.shopStep = 2;
          try {
            await bot.clickWindow(14, 0, 0);
          } catch (e) {}
          return;
        }

        if (bot.shopStep === 2) {
          bot.shopStep = 3;
          try {
            await bot.clickWindow(28, 0, 0);
          } catch (e) {}
          return;
        }

        if (bot.shopStep === 3) {
          try {
            await bot.clickWindow(50, 0, 0);
          } catch (e) {}

          bot.clearStuckTimer();
          setTimeout(() => {
            if (bot.isShopping) {
              bot.triggerShop();
            }
          }, 500);
        }
      }, 400);
    }
  });

  bot.on('kicked', (reason) => scheduleReconnect(reason));
  bot.on('error', (err) => scheduleReconnect(err.message));
  bot.on('end', (reason) => scheduleReconnect(reason || 'Koniec połączenia'));

  return bot;
}

// Uruchamianie botów z priorytetem (minokalira1 i minokalira2 startują najpierw)
BOT_NAMES.forEach((name, index) => {
  setTimeout(() => {
    createMultiBot(name);
  }, index * 4000);
});

// Obsługa wejścia z terminala
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => { 
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed === '@start' || trimmed === '!start' || trimmed === '#start') {
    startShoppingAll();
    return;
  }

  if (trimmed === '@stop' || trimmed === '!stop' || trimmed === '#stop') {
    stopShoppingAll();
    return;
  }

  if (trimmed.includes('rozdziel all') || trimmed.includes('rodziel all')) {
    triggerDistribute();
    return;
  }

  if (trimmed.includes('permissions all') || trimmed.includes('perm all')) {
    const parts = trimmed.split(/\s+/);
    const targetNick = parts[parts.length - 1];
    if (targetNick && targetNick !== 'all') {
      grantPermissionsAll(targetNick);
    }
    return;
  }

  if (trimmed.startsWith('@drop ') || trimmed.startsWith('!drop ') || trimmed.startsWith('#drop ')) {
    const targetNick = trimmed.split(' ')[1];
    if (targetNick) {
      dropAllForPlayer(targetNick);
    }
    return;
  }

  // Kierowanie wiadomości do konkretnego bota: @NICK TREŚĆ (np. @minokalira1 /home)
  if (trimmed.startsWith('@')) {
    const parts = trimmed.slice(1).split(/\s+/);
    const targetBotName = parts[0];
    const cmd = parts.slice(1).join(' ');

    if (!cmd) {
      console.log(`[SYSTEM]: Nie podano komendy/wiadomości dla bota ${targetBotName}`);
      return;
    }

    const foundBotKey = Object.keys(bots).find(k => k.toLowerCase() === targetBotName.toLowerCase());

    if (foundBotKey && bots[foundBotKey] && bots[foundBotKey]._client && bots[foundBotKey]._client.chat) {
      console.log(`[Terminal -> ${foundBotKey}]: ${cmd}`);
      bots[foundBotKey].chat(cmd);
    } else {
      console.log(`[SYSTEM]: Bot "${targetBotName}" nie został znaleziony lub nie jest połączony!`);
    }
    return;
  }

  console.log(`[Wszyscy -> Serwer]: ${trimmed}`);
  Object.values(bots).forEach(bot => {
    if (bot && bot._client && bot._client.chat) {
      bot.chat(trimmed);
    }
  });
});
