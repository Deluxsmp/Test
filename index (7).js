const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, 
    ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField 
} = require('discord.js');
require('dotenv').config();
const db = require('./src/database.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// টেস্টার এবং এডমিন রোল আইডি
const TESTER_ROLE_ID = '1530471633737875467';
const ADMIN_ROLE_ID = '1518301359332655144';
const RESULT_CHANNEL_ID = '1522942202874167549';

// গেমমোড অনুযায়ী ডিসকর্ড রোল আইডিগুলো
const GAMEMODE_ROLES = {
    'axe_shield': '1530472320190255225',
    'neth_pot': '1530467519347949668',
    'dia_pot': '1530470527033147503',
    'smp_kit': '1530470608222158868',
    'mace': '1530470957830111252',
    'sword': '1530471050092089475',
    'uhc': '1530471143134199938',
    'cpvp': '1530471204731883643'
};

// গেমমোড অনুযায়ী আলাদা আলাদা কিউ লিস্ট স্টোর করার জন্য
const queues = new Map(); // Map<gameMode, Array<{userId, ign}>>

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Bot successfully started in dot (.) command mode.`);
});

// ১. মেসেজ কমান্ড হ্যান্ডলার (ডট দিয়ে শুরু হওয়া কমান্ডগুলো কাজ করবে)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('.')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // ১. .request-test অথবা .setup-register প্যানেল পাঠানো
    if (commandName === 'request-test' || commandName === 'setup-register') {
        const embed = new EmbedBuilder()
            .setColor('#E02B2B')
            .setTitle('🏆 Vortex Tier')
            .setDescription('Register for our systems and join the testing waitlist.\n\n' +
                '**Step 1: Register Your Profile**\nClick the Register button to set your IGN and skin URL details.\n\n' +
                '**Step 2: Select Your Country**\nAfter registration, select your country from the dropdown.\n\n' +
                '**Step 3: Get a Waitlist Role**\nAfter selecting your country, select a gamemode below to get the waitlist role.\n\n' +
                'Select a gamemode to get the waitlist role\n' +
                '⚠️ Failure to provide authentic information will result in a denied test.');

        const rowButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('register_btn')
                .setLabel('Register / Update Profile')
                .setStyle(ButtonStyle.Success)
        );

        const rowSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('gamemode_select')
                .setPlaceholder('Select a gamemode to get the waitlist role')
                .addOptions([
                    { label: 'Axe And Shield', value: 'axe_shield', emoji: '🪓' },
                    { label: 'Neth Pot', value: 'neth_pot', emoji: '🧪' },
                    { label: 'Dia Pot', value: 'dia_pot', emoji: '💠' },
                    { label: 'Smp Kit', value: 'smp_kit', emoji: '🌿' },
                    { label: 'Mace', value: 'mace', emoji: '🔨' },
                    { label: 'Sword', value: 'sword', emoji: '⚔️' },
                    { label: 'Uhc', value: 'uhc', emoji: '🌍' },
                    { label: 'Cpvp', value: 'cpvp', emoji: '💥' }
                ])
        );

        await message.channel.send({ embeds: [embed], components: [rowButton, rowSelect] });
        return message.reply({ content: 'Panel sent successfully!' });
    }

    // ২. .queue-start <gamemode> কমান্ড (টেস্টারদের জন্য)
    if (commandName === 'queue-start') {
        if (!message.member.roles.cache.has(TESTER_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Only testers can use this command!' });
        }

        const gameMode = args[0]?.toLowerCase();
        if (!gameMode || !GAMEMODE_ROLES[gameMode]) {
            return message.reply({ content: '❌ Please provide a valid gamemode! Example: `.queue-start uhc` or `.queue-start cpvp`' });
        }

        if (!queues.has(gameMode)) {
            queues.set(gameMode, []);
        }

        const embed = new EmbedBuilder()
            .setTitle(`🎮 Queue: ${gameMode.toUpperCase()}`)
            .setDescription('No one has joined this queue yet. Click the **Join Queue** button below to join. (Max 10 players)')
            .setColor('Blue');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`join_queue_${gameMode}`).setLabel('Join Queue').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`leave_queue_${gameMode}`).setLabel('Leave Queue').setStyle(ButtonStyle.Danger)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply({ content: `✅ **${gameMode.toUpperCase()}** gamemode queue has been successfully started!` });
    }

    // ৩. .open-ticket <@user> <gamemode> কমান্ড (টেস্টারদের জন্য)
    // ৩. .open-ticket <@user> <gamemode> কমান্ড (টেস্টারদের জন্য)
    if (commandName === 'open-ticket') {
        if (!message.member.roles.cache.has(TESTER_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Only testers can use this command!' });
        }

        const targetUser = message.mentions.users.first();
        const gameMode = args[1]?.toLowerCase();

        if (!targetUser || !gameMode) {
            return message.reply({ content: '❌ Usage format: `.open-ticket @user uhc`' });
        }

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [targetUser.id], async (err, row) => {
            if (!row) return message.reply({ content: '❌ This player is not registered!' });

            // কিউ থেকে ইউজারকে রিমুভ করা এবং কিউ মেসেজ লাইভ আপডেট করা
            if (queues.has(gameMode)) {
                let list = queues.get(gameMode);
                const qIndex = list.findIndex(p => p.userId === targetUser.id);
                if (qIndex !== -1) {
                    list.splice(qIndex, 1); // তালিকা থেকে রিমুভ করা হলো (অটো পজিশন শিফট হবে)

                    // কিউ মেসেজটি চ্যানেল থেকে খুঁজে বের করে লাইভ আপডেট করা
                    try {
                        const fetchedMessages = await message.channel.messages.fetch({ limit: 50 });
                        const queueMsg = fetchedMessages.find(m => 
                            m.embeds.length > 0 && 
                            m.embeds[0].title && 
                            m.embeds[0].title.toLowerCase().includes(gameMode)
                        );

                        if (queueMsg) {
                            let desc = list.length === 0 ? 'No one in the queue yet.' : list.map((p, idx) => `**#${idx + 1}** - <@${p.userId}> (${p.ign})`).join('\n');
                            const updatedEmbed = new EmbedBuilder()
                                .setTitle(`🎮 Queue: ${gameMode.toUpperCase()}`)
                                .setDescription(desc)
                                .setColor('Blue');

                            await queueMsg.edit({ embeds: [updatedEmbed] });
                        }
                    } catch (e) {
                        console.error('Failed to update queue message live:', e);
                    }
                }
            }

            try {
                const guild = message.guild;
                const channel = await guild.channels.create({
                    name: `test-${row.ign}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: targetUser.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    ],
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎟️ Test Ticket Opened')
                    .setColor('Green')
                    .addFields(
                        { name: 'Player IGN', value: row.ign, inline: true },
                        { name: 'Discord', value: `<@${row.discord_id}>`, inline: true },
                        { name: 'Region / Country', value: row.region, inline: true },
                        { name: 'Launcher Version', value: row.version, inline: true },
                        { name: 'Game Mode', value: gameMode, inline: true }
                    );

                await channel.send({ content: `<@${targetUser.id}> <@${message.author.id}>`, embeds: [ticketEmbed] });
                return message.reply({ content: `✅ Ticket successfully opened: ${channel}` });
            } catch (e) {
                return message.reply({ content: '❌ Failed to create the ticket channel!' });
            }
        });
    }

    // ৪. .result <@user> কমান্ড (টেস্টারদের জন্য প্যানেল ও বাটন পাঠাবে)
    if (commandName === 'result') {
        if (!message.member.roles.cache.has(TESTER_ROLE_ID) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Only testers can use this command!' });
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply({ content: '❌ Usage format: `.result @user`' });
        }

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [targetUser.id], async (err, playerRow) => {
            if (err || !playerRow) {
                return message.reply({ content: '❌ This player is not registered in the database!' });
            }

            const embed = new EmbedBuilder()
                .setColor('Blue')
                .setTitle('🏆 Result Submission Panel')
                .setDescription(`Player: **${playerRow.ign}** (<@${targetUser.id}>)\n\nClick the **Open Result Form** button below to submit the test result.`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`open_result_form_${targetUser.id}`)
                    .setLabel('Open Result Form')
                    .setStyle(ButtonStyle.Primary)
            );

            await message.delete().catch(() => {});
            return message.channel.send({ embeds: [embed], components: [row] });
        });
    }

    // ৫. .profile কমান্ড (সকল ইউজারদের জন্য নিজের প্রোফাইল দেখার ব্যবস্থা)
    // ২. .profile কমান্ড (সকল ইউজারের জন্য নিজের প্রোফাইল দেখার ব্যবস্থা)
if (commandName === 'profile') {
    const targetUser = message.mentions.users.first() || message.author;

    db.get('SELECT * FROM players WHERE discord_id = ?', [targetUser.id], async (err, playerRow) => {
        if (err || !playerRow) {
            return message.reply({ content: `❌ No registered profile found for ${targetUser.id === message.author.id ? 'you' : 'this player'}!` });
        }

        // গেম মোডগুলোর টিয়ার চেক করা (ডাটাবেজে কলাম না থাকলে N/A দেখাবে)
        const getTier = (tier) => tier ? tier : 'N/A';

        const profileEmbed = new EmbedBuilder()
            .setColor('Green')
            .setTitle(`👤 Player Profile: ${playerRow.ign}`)
            .addFields(
                { name: '🎮 In-Game Name (IGN)', value: playerRow.ign, inline: true },
                { name: '🌍 Region / Country', value: playerRow.region || 'N/A', inline: true },
                { name: '💻 Launcher Version', value: playerRow.version || 'N/A', inline: true },     
                // গেম মোড টিয়ার ফিল্ডগুলো
                { name: '🪓 Axe And Shield', value: getTier(playerRow.axe_shield), inline: true },
                { name: '🧪 Neth Pot', value: getTier(playerRow.neth_pot), inline: true },
                { name: '🔷 Dia Pot', value: getTier(playerRow.dia_pot), inline: true },
                { name: '🛡️ Smp Kit', value: getTier(playerRow.smp_kit), inline: true },
                { name: '🗡️ Mace', value: getTier(playerRow.mace), inline: true },
                { name: '❌ Sword', value: getTier(playerRow.sword), inline: true },
                { name: '🌐 Uhc', value: getTier(playerRow.uhc), inline: true },
                { name: '💥 Cpvp', value: getTier(playerRow.cpvp), inline: true }
            )
            .setTimestamp();

        return message.reply({ embeds: [profileEmbed] });
    });
}

    // ৬. .leaderboard কমান্ড
    if (commandName === 'leaderboard') {
        db.all(`SELECT * FROM players ORDER BY points DESC LIMIT 10`, (err, rows) => {
            if (err || !rows.length) return message.reply({ content: 'No data available.' });
            let list = rows.map((r, index) => `**#${index + 1}** - <@${r.discord_id}> (${r.ign}) - Points: **${r.points || 0}**`).join('\n');
            const embed = new EmbedBuilder().setTitle('🏆 Top 10 Leaderboard').setDescription(list).setColor('Gold');
            return message.reply({ embeds: [embed] });
        });
    }
// ৮. .help কমান্ড (সকলের জন্য)
    if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🤖 Bot Commands & Help Menu')
            .setDescription('Here is the list of all available commands for players and testers:')
            .addFields(
                { name: '👤 For Everyone (Players)', value: '`.profile` - View your registered profile and points.\n`.leaderboard` - View the top 10 player leaderboard.' },
                { name: '🛠️ For Testers & Admins', value: '`.request-test` or `.setup-register` - Send the main registration & gamemode panel.\n`.queue-start <gamemode>` - Start a queue for a specific gamemode.\n`.open-ticket @user <gamemode>` - Open a private test ticket for a player.\n`.result @user` - Open the result submission panel.\n`.tester-stats` - View tester statistics.' }
            )
            .setTimestamp();

        return message.reply({ embeds: [helpEmbed] });
    }

// ৮. .set-tester <@user> কমান্ড (টেস্টার রোল দেওয়ার জন্য - শুধুমাত্র এডমিনদের জন্য)
    if (commandName === 'set-tester') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Only administrators can use this command!' });
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply({ content: '❌ Please mention a user! Usage: `.set-tester @user`' });
        }

        try {
            await targetMember.roles.add(TESTER_ROLE_ID);
            return message.reply({ content: `✅ Successfully gave the tester role to <@${targetMember.id}>!` });
        } catch (error) {
            return message.reply({ content: '❌ Failed to add the tester role. Please check bot permissions and role hierarchy.' });
        }
    }

    // ৯. .remove-tester <@user> কমান্ড (টেস্টার রোল রিমুভ করার জন্য - শুধুমাত্র এডমিনদের জন্য)
    if (commandName === 'remove-tester') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Only administrators can use this command!' });
        }

        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply({ content: '❌ Please mention a user! Usage: `.remove-tester @user`' });
        }

        try {
            await targetMember.roles.remove(TESTER_ROLE_ID);
            return message.reply({ content: `✅ Successfully removed the tester role from <@${targetMember.id}>!` });
        } catch (error) {
            return message.reply({ content: '❌ Failed to remove the tester role. Please check bot permissions and role hierarchy.' });
        }
    }
    
    // ৭. .tester-stats কমান্ড
    if (commandName === 'tester-stats') {
        const tester = message.mentions.users.first() || message.author;
        return message.reply({ content: `📊 Tester <@${tester.id}> stats loaded successfully.` });
    }
});

// ২. বাটন, সিলেক্ট মেনু এবং মোডাল ইন্টারঅ্যাকশন হ্যান্ডলার
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    // রেজিস্টার বাটন ক্লিক করলে চেক করবে আগে রেজিস্টার্ড কি না
    if (interaction.isButton() && interaction.customId === 'register_btn') {
        const userId = interaction.user.id;

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, row) => {
            if (row) {
                return interaction.reply({ 
                    content: '⚠️ You have already registered your profile! You can now select a gamemode from the dropdown to join the queue for testing.', 
                    ephemeral: true 
                });
            }

            const modal = new ModalBuilder()
                .setCustomId('register_modal')
                .setTitle('Player Registration');

            const ignInput = new TextInputBuilder()
                .setCustomId('ign_input')
                .setLabel('In-game Name (IGN)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const regionInput = new TextInputBuilder()
                .setCustomId('region_input')
                .setLabel('Region / Country (e.g., AS, BD, NA)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const versionInput = new TextInputBuilder()
                .setCustomId('version_input')
                .setLabel('Launcher Version (Official/Crack)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(ignInput),
                new ActionRowBuilder().addComponents(regionInput),
                new ActionRowBuilder().addComponents(versionInput)
            );

            return interaction.showModal(modal);
        });
    }

    // রেজাল্ট ফর্ম বাটন ক্লিক করলে মোডাল ওপেন হবে
    if (interaction.isButton() && interaction.customId.startsWith('open_result_form_')) {
        const targetUserId = interaction.customId.split('_')[3];

        const modal = new ModalBuilder()
            .setCustomId(`submit_result_modal_${targetUserId}`)
            .setTitle('🏆 Test Result Form');

        const gamemodeInput = new TextInputBuilder()
            .setCustomId('gamemode_input')
            .setLabel('Gamemode (e.g. uhc, cpvp)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const rankInput = new TextInputBuilder()
            .setCustomId('rank_input')
            .setLabel('Achieved Rank (e.g. Tier-1)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const pointsInput = new TextInputBuilder()
            .setCustomId('points_input')
            .setLabel('Points (Numbers only)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gamemodeInput),
            new ActionRowBuilder().addComponents(rankInput),
            new ActionRowBuilder().addComponents(pointsInput)
        );

        return await interaction.showModal(modal);
    }

    // গেমমোড সিলেক্ট মেনু থেকে রোল দেওয়া
    if (interaction.isStringSelectMenu() && interaction.customId === 'gamemode_select') {
        const userId = interaction.user.id;
        const selectedMode = interaction.values[0];
        const roleId = GAMEMODE_ROLES[selectedMode];

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, row) => {
            if (err || !row) {
                return interaction.reply({ 
                    content: '❌ You have not registered your Minecraft profile yet! Please click the **Register / Update Profile** button first.', 
                    ephemeral: true 
                });
            }

            try {
                const member = await interaction.guild.members.fetch(userId);
                if (roleId) {
                    await member.roles.add(roleId);
                }
                return interaction.reply({ content: `✅ Gamemode role successfully assigned!`, ephemeral: true });
            } catch (error) {
                return interaction.reply({ content: '❌ Failed to assign role. Please check bot permissions.', ephemeral: true });
            }
        });
    }

    // রেজিস্ট্রেশন মোডাল সাবমিট হলে ডেটাবেজে সেভ হওয়া
    if (interaction.isModalSubmit() && interaction.customId === 'register_modal') {
        const ign = interaction.fields.getTextInputValue('ign_input');
        const region = interaction.fields.getTextInputValue('region_input');
        const version = interaction.fields.getTextInputValue('version_input');
        const userId = interaction.user.id;

        db.run(
            `INSERT INTO players (discord_id, ign, region, version) VALUES (?, ?, ?, ?)`,
            [userId, ign, region, version],
            (err) => {
                if (err) return interaction.reply({ content: '❌ You have already registered or a database error occurred.', ephemeral: true });
                return interaction.reply({ content: `✅ Profile successfully registered! IGN: **${ign}**`, ephemeral: true });
            }
        );
    }

    // রেজাল্ট মোডাল সাবমিট হওয়ার পর ডেটাবেজ আপডেট, চ্যানেলে পাঠানো, টিকিট ক্লোজ ও কিউ থেকে রিমুভ করা (অটো পজিশন শিফটিং সহ)
    if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_result_modal_')) {
        const targetUserId = interaction.customId.split('_')[3];
        const gamemodeInputVal = interaction.fields.getTextInputValue('gamemode_input').toLowerCase().trim();
        const achievedRank = interaction.fields.getTextInputValue('rank_input');
        const points = parseInt(interaction.fields.getTextInputValue('points_input'));

        if (isNaN(points)) {
            return interaction.reply({ content: '❌ Points must be numbers only!', ephemeral: true });
        }

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [targetUserId], async (err, playerRow) => {
            if (err || !playerRow) {
                return interaction.reply({ content: '❌ Player not found in the database!', ephemeral: true });
            }

            db.run(`UPDATE players SET points = ? WHERE discord_id = ?`, [points, targetUserId], async (err) => {
                if (err) {
                    return interaction.reply({ content: '❌ Failed to update the database!', ephemeral: true });
                }

                try {
                    // ১. রেজাল্ট চ্যানেলে এম্বেড পাঠানো
                    const resultChannel = await interaction.guild.channels.fetch(RESULT_CHANNEL_ID);
                    if (resultChannel) {
                        const resultEmbed = new EmbedBuilder()
                            .setColor('Gold')
                            .setTitle('🏆 Test Result & Evaluation')
                            .addFields(
                                { name: '🕹️ Tester', value: `<@${interaction.user.id}>`, inline: true },
                                { name: '👤 Player IGN', value: `**${playerRow.ign}**`, inline: true },
                                { name: '🎮 Gamemode', value: `**${gamemodeInputVal}**`, inline: true },
                                { name: '🏆 Achieved Rank', value: `**${achievedRank}**`, inline: true },
                                { name: '⭐ Points', value: `**${points}**`, inline: true }
                            )
                            .setTimestamp();

                        await resultChannel.send({ embeds: [resultEmbed] });
                    }

                    // ২. প্লেয়ারটি যেই গেমমোডের কিউতে ছিল সেখান থেকে রিমুভ করা (বাকিরা অটোমেটিক সামনের দিকে শিফট হয়ে যাবে)
                    if (queues.has(gamemodeInputVal)) {
                        let list = queues.get(gamemodeInputVal);
                        const index = list.findIndex(p => p.userId === targetUserId);
                        if (index !== -1) {
                            list.splice(index, 1);
                        }
                    }

                    // ৩. প্যানেল মেসেজটি ডিলিট করা
                    await interaction.message.delete().catch(() => {});

                    await interaction.reply({ content: '✅ Result successfully submitted, queue updated, and ticket is closing!', ephemeral: true });

                    // ৪. টিকিটের চ্যানেলটি অটোমেটিক ক্লোজ/ডিলিট করে দেওয়া
                    const currentChannel = interaction.channel;
                    if (currentChannel && currentChannel.name.startsWith('test-')) {
                        setTimeout(async () => {
                            await currentChannel.delete().catch(() => {});
                        }, 3000);
                    }

                } catch (error) {
                    console.error(error);
                    return interaction.reply({ content: '❌ An error occurred while processing the result.', ephemeral: true });
                }
            });
        });
    }

    // কিউতে জয়েন বা লিভ করার বাটন হ্যান্ডলার
    if (interaction.isButton() && (interaction.customId.startsWith('join_queue_') || interaction.customId.startsWith('leave_queue_'))) {
        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const gameMode = parts.slice(2).join('_'); 
        const userId = interaction.user.id;

        db.get(`SELECT * FROM players WHERE discord_id = ?`, [userId], async (err, playerRow) => {
            if (!playerRow) {
                return interaction.reply({ content: '❌ You must register your profile before joining the queue!', ephemeral: true });
            }

            if (!queues.has(gameMode)) queues.set(gameMode, []);
            let list = queues.get(gameMode);

            if (action === 'join') {
                if (list.some(p => p.userId === userId)) {
                    return interaction.reply({ content: '⚠️ You are already in this queue!', ephemeral: true });
                }
                if (list.length >= 10) {
                    return interaction.reply({ content: '❌ This queue is full (Maximum 10 players)!', ephemeral: true });
                }

                list.push({ userId, ign: playerRow.ign });
                await interaction.reply({ content: `✅ Successfully joined the **${gameMode}** queue!`, ephemeral: true });
            } else if (action === 'leave') {
                const index = list.findIndex(p => p.userId === userId);
                if (index === -1) {
                    return interaction.reply({ content: '⚠️ You are not in this queue!', ephemeral: true });
                }
                list.splice(index, 1);
                await interaction.reply({ content: `✅ Successfully left the **${gameMode}** queue!`, ephemeral: true });
            }

            let desc = list.length === 0 ? 'No one in the queue yet.' : list.map((p, idx) => `**#${idx + 1}** - <@${p.userId}> (${p.ign})`).join('\n');
            const updatedEmbed = new EmbedBuilder()
                .setTitle(`🎮 Queue: ${gameMode.toUpperCase()}`)
                .setDescription(desc)
                .setColor('Blue');

            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
        });
    }
});

client.login(process.env.DISCORD_TOKEN);