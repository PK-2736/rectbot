import discord
import os

TOKEN = os.getenv('DISCORD_BOT_TOKEN')

class MyClient(discord.Client):
    async def on_ready(self):
        print(f'Logged in as {self.user}')

client = MyClient()
client.run(TOKEN)
