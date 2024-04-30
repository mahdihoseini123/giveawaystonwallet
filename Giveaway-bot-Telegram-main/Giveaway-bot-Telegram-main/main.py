from telegram.ext import ApplicationBuilder, ContextTypes, CommandHandler, ConversationHandler, MessageHandler, filters
from telegram import Update
import openpyxl
import logging

htmlText = '''
<b>Giveaway</b>

<b>!!! IMPORTANT !!!</b>
<i>
By using the command <code>/accept</code>, you assume responsibility for every action taken.
If false data is entered or tampered with, the support automatically deletes the registration.

<u>To win the Giveaway, you must complete the following steps:</u>

- All accounts invited by the user must be present in the community <u><b>@(group tag)</b></u>
- All accounts invited by the user must be present in the (group name) channel <u><b>@(channel tag)</b></u>
</i>

List of commands:

<b>1.</b> /start | Giveaway Explanation
<b>2.</b> /wallet  | ton Address 
<b>3.</b> /accept  | Terms and conditions to participate in the Giveaway
<b>4.</b> /leaderboard  | Top 1000 Users
<b>5.</b> /data | Check your information
<b>6.</b> /prize | Prize information
<b>7.</b> /help | Contact support

<i>To share your referral link and climb the leaderboard, simply use the <code>/data</code> command and copy your personal link.
Every user who uses your link following the listed steps is counted in the global leaderboard, increasing your position.</i>
'''

htmlText2 = '''
<b>Prize for the first-ranked worth 1ton</b>

<i>The prize will be directly deposited into the Wallet Address declared during the Giveaway.</i>

<u>REMEMBER!!!</u>

<i>just a gaveaways.</i>
'''

async def updateFile():
    global wb, sheet
    wb.close()
    wb = openpyxl.load_workbook('List.xlsx')
    sheet = wb['Sheet1']

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
    
def userInsideSheet(userId: int):
    rows = list(sheet.rows)
    for row in rows:
        if userId == sheet[f"A{rows.index(row)+1}"].value:
            return True
    return False

def userRow(userId: int):
    rowResult = None
    rows = list(sheet.rows)
    if userInsideSheet(userId):
        for row in rows:
            if userId == sheet[f"A{rows.index(row)+1}"].value:
                rowResult = rows.index(row) + 1
    return rowResult

def pushData(userId: int, column: str, data: str):
    if userInsideSheet(userId):
        sheet[column + str(userRow(userId))] = data
        wb.save('List.xlsx')

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await updateFile()
    uuid = update.message.from_user['id']
    try:
        referral_link_user_id = int(update.message.text.split(" ")[1])
        if userInsideSheet(referral_link_user_id) and not userInsideSheet(uuid):
            await ctx.bot.send_message(chat_id=update.effective_chat.id, text="You registered on behalf of: " + str(sheet[f"B{userRow(referral_link_user_id)}"].value))
            lista = sheet[f"F{userRow(referral_link_user_id)}"].value
            if lista == None:
                pushData(referral_link_user_id, "F", "[]")
            lista = eval(sheet[f"F{userRow(referral_link_user_id)}"].value)
            lista.append(update.message.from_user['name'])
            pushData(referral_link_user_id, "F", str(lista))
            pushData(referral_link_user_id, "G", str(len(lista)))
    except:
        pass

    if not userInsideSheet(uuid):
        rows = list(sheet.rows)
        sheet[f"A{len(rows)+1}"] = uuid
        sheet[f"B{len(rows)+1}"] = update.message.from_user['name']
        wb.save('List.xlsx')
        pushData(uuid, "E", "(link bot telegram for giveaway example = https://t.me/nameexampleforscript_BOT?start=)" + str(uuid))
        pushData(uuid, "G", 0)
    await ctx.bot.send_message(chat_id=update.effective_chat.id, text=htmlText, parse_mode="HTML")

async def Walletton(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await updateFile()
    uuid = update.message.from_user['id']
    if sheet[f"C{userRow(uuid)}"].value == None:
        await ctx.bot.send_message(chat_id=update.effective_chat.id, text="Setting your Wallet Address ton: " + ''.join(ctx.args))
        pushData(uuid, "C", ''.join(ctx.args))
    else:
        await ctx.bot.send_message(chat_id=update.effective_chat.id, text="I updated your Wallet Address ton: " + ''.join(ctx.args))
        pushData(uuid, "C", ''.join(ctx.args))

async def getregard(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await updateFile()
    uuid = update.message.from_user['id']
    await ctx.bot.send_message(chat_id=update.effective_chat.id, text=htmlText2, parse_mode="HTML")

async def gethelp(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await updateFile()
    uuid = update.message.from_user['id']
    await ctx.bot.send_message(chat_id=update.effective_chat.id, text="If you have persistent errors or wish to contact support, send an email to (email support), a ticket will be created on our platform. If you want to engage with the community, find the support topic in the (tag group telegram).")

async def acceptConditions(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await updateFile()
    uuid = update.message.from_user['id']
    if sheet[f"D{userRow(uuid)}"].value == None:
        await ctx.bot.send_message(chat_id=update.effective_chat.id, text="You have accepted the Terms and Conditions.")
        pushData(uuid, "D", str(True))
    else:
        await ctx.bot.send_message(chat_id=update.effective_chat.id, text="You have already accepted the Terms and Conditions.")

async def getData(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await updateFile()
    uuid = update.message.from_user['id']
    row = userRow(uuid)
    tgName, Walletton, acceptedConditions, getlink= sheet[f"B{row}"].value, sheet[f"C{row}"].value, sheet[f"D{row}"].value, sheet[f"E{row}"].value
    baseString = f"Your data summary:\n<b>Telegram Username:</b> {tgName}\n<b>Address ton:</b> {Walletton}\n<b>Accept Terms and Conditions:</b> {'&#10060;' if not bool(acceptedConditions) else '&#9989;'}\n<b>Referral link:</b> {getlink}"
    await ctx.bot.send_message(chat_id=update.effective_chat.id, text=baseString + "\nType /accept to agree to the terms and release liability from (name company)" if not bool(acceptedConditions) else baseString, parse_mode='HTML')

async def leaderboard(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await updateFile()
    uuid = update.message.from_user['id']
    rows = list(sheet.rows)
    data = {sheet[f"B{rows.index(row)+1}"].value:int(sheet[f"G{rows.index(row)+1}"].value) for row in rows[1:]}
    data = dict(sorted(data.items(), key=lambda x:x[1], reverse=True))
    res = "<b>Here's the top 100:</b>\n"
    for item in list(data.keys())[:100]:
        res += "<b>" + item + "</b>: " + str(data[item]) + "\n"
    res += "-----------------------------\n<b>" + str(list(data.keys()).index(sheet[f"B{userRow(uuid)}"].value)+1) + ". " + sheet[f"B{userRow(uuid)}"].value + "</b>: " + str(data[sheet[f"B{userRow(uuid)}"].value])
    await ctx.bot.send_message(chat_id=update.effective_chat.id, text=res, parse_mode='HTML')

if __name__ == "__main__":
    wb = openpyxl.load_workbook('List.xlsx')
    sheet = wb['Sheet1']
    app = ApplicationBuilder().token('YOUR_BOT_TOKEN').build()
    app.add_handlers(
        [
            CommandHandler('start', start), 
            CommandHandler("wallet", Walletton),
            CommandHandler("data", getData), 
            CommandHandler("accept", acceptConditions),
            CommandHandler("leaderboard", leaderboard),   
            CommandHandler("help", gethelp),          
            CommandHandler("regard", getregard),                   
        ]
    )
    app.run_polling()