"""
Report Processing Repository Layer (Stage 7)

Durable persistence, versioning, seed standards, approved examples library,
human edit diff learning, idempotency tracking, and completed report archives.
"""

import json
import os
from datetime import datetime, timezone
import time
import uuid
from typing import Any, Dict, List, Optional

from app.database.connection import connection_scope, get_db_connection
from app.database.session_repo import session_repo


DEFAULT_ANTI_SLOP_RULES = """1. Absolute prohibition of AI buzzwords, generic idioms, and editorial cliches:
   Forbidden words/phrases include: 'tapestry', 'rich tapestry', 'beacon', 'dive into', 'delve',
   'testament to', 'pivotal', 'game-changer', 'in conclusion', 'furthermore', 'it is worth noting',
   'serves as', 'unpacking', 'dynamic journey', 'holistic landscape', 'masterclass'.
2. Maintain serious, reverent, pastoral, authentic Christian preaching voice:
   Reflect the pulpit manner and exact theological gravity of the Deeper Christian Life Ministry
   and Pastor (Dr) W.F. Kumuyi.
3. No hallucinated scriptures, acronyms, or non-existent sub-points:
   Every scripture citation must strictly correspond to what was read or referenced in the message.
   Do not fabricate mnemonics, alliterations, or sub-points not uttered in the sermon.
4. Faithful preservation of doctrinal focus:
   Retain the clear evangelical message of salvation, sanctification, holy living, and Christian service."""

DEFAULT_REPORTER_EXTRACTION_INSTRUCTIONS = """Extract the full factual structure of the sermon across the 20 fundamental Information Unit categories:
1. Primary speaker identification and ministerial role.
2. Central sermon theme, operative title, and foundational text.
3. Introductory remarks, background context, and doctrinal thesis.
4. Complete list of scripture readings and citations (book, chapter, verses).
5. Exact biblical character illustrations and historical examples cited.
6. Major division headings (typically 3 Roman-numeral points in DLBC sermons).
7. Sub-points and expository breakdowns under each division heading.
8. Core doctrinal premises (e.g. grace, repentance, regeneration, sanctification, holy walk).
9. Contemporary and real-life analogies used by the preacher.
10. Solemn pastoral warnings against sin, backsliding, and spiritual compromise.
11. Diagnostic self-examination questions put to the congregation.
12. Practical instructions for daily Christian conduct and duty.
13. Promises and assurances from God's Word highlighted.
14. Hymn verses, spiritual choruses, or poetry recited during the sermon.
15. Exhortations on evangelism, discipleship, and soul-winning.
16. Eschatological warnings and references to the Second Coming / Judgment.
17. Biblical qualifications or conditions attached to divine blessings.
18. Special prayer burdens, altar calls, and specific calls to action.
19. Final summary points reiterated before the closing prayer.
20. Closing pastoral benediction and ministerial admonition."""

DEFAULT_EDITORIAL_SELECTION_INSTRUCTIONS = """Apply discerning editorial judgment to the extracted material using the KEEP / COMPRESS / OMIT framework:
1. KEEP:
   - Core theological thesis, foundational scriptures, and all major Roman-numeral message divisions.
   - Distinctive pastoral insights, doctrinal warnings, and biblical illustrations.
   - Specific commands, spiritual directives, and practical application points.
   - Direct scripture quotes central to the exposition.
2. COMPRESS:
   - Prolonged oratorical repetition where the minister repeats an exhortation for rhetorical emphasis.
   - Interactive call-and-response with the congregation (e.g., 'Somebody say Amen', 'Can I hear an Amen?').
   - General procedural housekeeping or extended conversational greetings.
   - Long lists of parallel examples into a tight, impactful summary of 2-3 key examples.
3. OMIT:
   - Accidental speech disfluencies, stuttering, vocal hesitations, or throat clearing.
   - Non-sermon platform announcements, micro-adjustments, or technical remarks to sound engineers.
   - Duplicated transcript sections or filler phrases."""

DEFAULT_WRITING_INSTRUCTIONS = """Compose an authoritative, publication-ready DLBC Information Unit Report adhering to the established publication style:
1. Document Header:
   - Title: Dignified, faithful, and compelling summary of the message.
   - Theme: The over-arching biblical subject.
   - Scripture Reference: The primary Bible passage.
   - Minister: Exact name and title (e.g., Pastor (Dr) W.F. Kumuyi).
   - Service Date: Cleanly formatted date (e.g., Aug 23, 2026).
2. Introduction:
   - 2-3 substantive paragraphs establishing the setting, biblical context, and spiritual necessity of the message.
3. Major Outlines:
   - Render each main sermon division under clear headings (e.g., '1. THE PURPOSE OF CONSECRATION', '2. THE PRACTICE OF HOLINESS', '3. THE PROMISE OF PRESERVATION').
   - Under each heading, provide structured, comprehensive expository paragraphs integrating the scripture citations.
4. Pastoral Admonitions & Practical Applications:
   - Capture the heart-searching, convicting, and uplifting admonitions delivered to the flock.
5. Conclusion & Action Points:
   - Summarize the message's demand on the hearer, concluding with specific prayer targets."""

DEFAULT_PROOFREADING_INSTRUCTIONS = """Perform rigorous linguistic, theological, and stylistic verification:
1. Scripture Verification: Confirm all Bible book names, chapters, and verses are accurate.
2. Name Precision: Verify all biblical and modern names are spelled accurately without corruption.
3. Grammatical Integrity: Ensure flawless syntax, subject-verb agreement, and punctuation.
4. Tone Audit: Validate that the tone is solemn, uplifting, reverent, and free of conversational flippancy.
5. Anti-Slop Audit: Confirm zero presence of banned AI cliches or buzzwords."""


SEED_APPROVED_EXAMPLES = [
    {
        'id': 'seed_example_am_01',
        'section_letter': 'AM',
        'section_name': 'Sunday Worship Service',
        'title': "The Believer's High Calling to Holy Living",
        'theme': 'Holiness and Divine Purpose',
        'scripture_reference': '1 Peter 1:13-16; Leviticus 11:44-45',
        'minister': 'Pastor (Dr) W.F. Kumuyi',
        'service_date': 'August 23, 2026',
        'teaching_goal': 'To establish holiness not as an optional standard, but as the indispensable nature and calling of every true child of God.',
        'editorial_focus': 'Expository teaching on sanctification, personal purity, and the practical walk of the believer in an ungodly generation.',
        'approved_content': """TITLE: The Believer's High Calling to Holy Living
THEME: Holiness and Divine Purpose
TEXT: 1 Peter 1:13-16; Leviticus 11:44-45
MINISTER: Pastor (Dr) W.F. Kumuyi
DATE: August 23, 2026

INTRODUCTION
The Christian calling is neither a casual invitation to religious association nor an earthly pursuit of mundane benefits. It is a high, heavenly, and holy calling instituted by the sovereign God before the foundation of the world. In this epochal message, the man of God directs the attention of the church to the foundational demand of the Christian life: holiness of heart and conduct. God has not called His people unto uncleanness, but unto holiness. Where holiness is absent, all religious profession is merely empty formality. The call to holiness is universal, practical, and non-negotiable for every believer who seeks to see the Lord in peace.

1. THE FOUNDATION OF THE HOLY CALLING (1 Peter 1:13-14)
The believer must first gird up the loins of his mind and be sober. True holiness begins within the renewed heart and disciplined mind. When a man is born again, old things pass away and all things become new. He no longer fashions himself according to the former lusts in his ignorance. Ignorance of God's Word breeds conformity to worldly patterns, but the enlightenment of the Holy Spirit generates a conscious detachment from worldly pursuits. The foundation is rooted in genuine repentance and regeneration, without which holiness remains an impossible striving of human willpower.

2. THE FULNESS OF THE DIVINE STANDARD (1 Peter 1:15-16; Leviticus 19:2)
The standard of holiness is not determined by human culture, ecclesiastical tradition, or societal consensus. The standard is God Himself: 'Be ye holy; for I am holy.' God's holiness is absolute, unblemished, and eternal. When God commands His children to be holy, He does not demand what His grace cannot supply. Sanctification is both a definite work of grace and a progressive daily conformity to the image of Jesus Christ. It touches thoughts, words, motives, business dealings, family life, and ministerial conduct.

3. THE FAITHFUL WALK OF A CONSECRATED LIFE (1 Peter 1:17; Hebrews 12:14)
A holy life is evidenced by a continuous, reverent walk with God throughout the time of our earthly sojourning. The consecrated believer conducts himself in the fear of God, knowing that the Father judges every man's work without respect of persons. Holiness produces steadfastness in times of trial, victory over secret temptation, and radiant fruitfulness in Christian service. Without holiness, no man shall see the Lord, but the pure in heart are promised the eternal vision of God.

CONCLUSION AND CALL TO CONSECRATION
Every hearer is summoned to cast aside all spiritual lukewarmness and surrender completely to the sanctifying power of the Blood of Jesus. As we humble ourselves in prayer, the Lord will purge every iniquity, impart His holy nature, and empower us to walk worthy of our divine vocation.""",
    },
    {
        'id': 'seed_example_an_01',
        'section_letter': 'AN',
        'section_name': 'Bible Study',
        'title': 'The Sovereign Triumph of Grace in the Believer',
        'theme': 'Freedom from Condemnation and Life in the Spirit',
        'scripture_reference': 'Romans 8:1-14',
        'minister': 'Pastor (Dr) W.F. Kumuyi',
        'service_date': 'August 24, 2026',
        'teaching_goal': 'To expound the doctrine of justification, the triumph over the law of sin, and the inward witness of the Holy Spirit.',
        'editorial_focus': 'Verse-by-verse doctrinal exposition with sharp distinctions between the carnal mind and the spiritual mind.',
        'approved_content': """TITLE: The Sovereign Triumph of Grace in the Believer
THEME: Freedom from Condemnation and Life in the Spirit
TEXT: Romans 8:1-14
MINISTER: Pastor (Dr) W.F. Kumuyi
DATE: August 24, 2026

INTRODUCTION
Romans chapter eight stands as the pinnacle of New Testament doctrinal revelation. Having dealt with the guilt of humanity, justification by faith, and the inward conflict between the flesh and the law in preceding chapters, the Apostle Paul opens chapter eight with a glorious declaration of complete liberation. There is therefore now no condemnation to them which are in Christ Jesus. In this comprehensive Bible Study, the believer is guided into the reality of the Spirit-filled life that breaks the dominion of sin and imparts divine assurance.

1. FREEDOM FROM CONDEMNATION THROUGH THE SPIRIT OF LIFE (Romans 8:1-4)
The believer's standing before God is grounded upon the finished work of Christ. The law of the Spirit of life in Christ Jesus has made the believer free from the law of sin and death. What the moral law could not do in that it was weak through the flesh, God accomplished by sending His own Son in the likeness of sinful flesh, condemning sin in the flesh. The righteousness of the law is now fulfilled in those who walk not after the flesh, but after the Spirit. Condemnation is removed because guilt has been judged and cleansed.

2. THE DIVERGENCE BETWEEN THE CARNAL MIND AND THE SPIRITUAL MIND (Romans 8:5-9)
The Scripture presents a clear and irreconcilable contrast between two minds: the carnal mind and the spiritual mind. To be carnally minded is death; but to be spiritually minded is life and peace. The carnal mind is enmity against God: for it is not subject to the law of God, neither indeed can be. Those who are in the flesh cannot please God. The true Christian, however, is not in the flesh, but in the Spirit, if the Spirit of God dwells in him. The presence of the Spirit is the indispensable mark of divine ownership.

3. THE OBLIGATION TO MORTIFY THE DEEDS OF THE BODY (Romans 8:10-14)
As sons of God, we are debtors, not to the flesh to live after the flesh. If a person lives after the flesh, he shall die; but if he through the Spirit does mortify the deeds of the body, he shall live. Mortification is not asceticism or monastic withdrawal; it is the active, Spirit-empowered putting to death of every sinful desire, habit, and worldly ambition. As many as are led by the Spirit of God, they are the sons of God.

PRAYER AND STUDY SUMMARY
The believer must examine his walk daily. Victory is maintained by continual abiding in Christ and responsive obedience to the Holy Spirit's guidance.""",
    },
    {
        'id': 'seed_example_ao_01',
        'section_letter': 'AO',
        'section_name': 'Revival & Evangelism',
        'title': 'Total Deliverance and Dominion Through the Power of Christ',
        'theme': 'Spiritual Authority, Deliverance, and Triumph',
        'scripture_reference': 'Luke 10:17-20; Colossians 2:13-15',
        'minister': 'Pastor (Dr) W.F. Kumuyi',
        'service_date': 'August 28, 2026',
        'teaching_goal': 'To ignite faith for immediate deliverance from all demonic oppression, sickness, and spiritual captivity through the authority in Jesus name.',
        'editorial_focus': 'High-faith, evangelistic and deliverance sermon with vivid calls to instantaneous miracle reception and salvation.',
        'approved_content': """TITLE: Total Deliverance and Dominion Through the Power of Christ
THEME: Spiritual Authority, Deliverance, and Triumph
TEXT: Luke 10:17-20; Colossians 2:13-15
MINISTER: Pastor (Dr) W.F. Kumuyi
DATE: August 28, 2026

INTRODUCTION
The gospel of Jesus Christ is not a philosophy of despair, nor is it a powerless creed. It is the power of God unto salvation to everyone that believeth. In this miracle-packed revival service, the minister of God declares the absolute lordship of Jesus Christ over all powers of darkness, sickness, ancestral yokes, and demonic oppressions. The enemy has held many bound in fear and torment, but tonight the Word of power goes forth to break every chain and set the captives free.

1. THE CONQUERING AUTHORITY OF THE NAME OF JESUS (Luke 10:17-18; Acts 4:12)
The disciples returned with joy, testifying that even the devils were subject unto them through the Name of Jesus. The Name of Jesus is invested with all power in heaven, on earth, and under the earth. At the utterance of that Name, every knee must bow. The Lord revealed that He beheld Satan as lightning fall from heaven. The dominion of Satan has been decisively shattered at Calvary; he is a defeated foe whose power is broken for everyone who trusts in the Redeemer.

2. THE UNLIMITED DOMINION OF THE CONVERTED BELIEVER (Luke 10:19; Mark 16:17-18)
The Lord has given His servants authority to tread on serpents and scorpions, and over all the power of the enemy: and nothing shall by any means hurt them. This dominion is not a future dream; it is a present reality for the sanctified child of God. Sickness has no right to dwell in the body of the believer; curses have no legal standing where the Blood of Jesus speaks; fear has no jurisdiction over a heart filled with divine faith.

3. THE SUPREME JOY OF CITIZENSHIP IN HEAVEN (Luke 10:20; Revelation 21:27)
While miracles and deliverance are marvelous, the Lord warns us not to rejoice primarily that the spirits are subject unto us, but rather to rejoice because our names are written in heaven. Heavenly citizenship is the ultimate blessing. If a person receives healing but loses his soul, he has lost everything. Therefore, salvation from sin is the primary miracle that opens the door to every other divine blessing.

PRAYER OF DELIVERANCE
The minister invites all who are oppressed to claim their instant deliverance by faith, renouncing sin and receiving Jesus as Lord and Saviour.""",
    },
    {
        'id': 'seed_example_ap_01',
        'section_letter': 'AP',
        'section_name': 'Retreat & Special Convocation',
        'title': 'Walking in the Power of an Endless Life',
        'theme': 'The Eternal Priesthood and Sufficiency of Christ',
        'scripture_reference': 'Hebrews 7:15-25; 2 Timothy 1:7-10',
        'minister': 'Pastor (Dr) W.F. Kumuyi',
        'service_date': 'December 26, 2026',
        'teaching_goal': 'To elevate the vision of the church to the unchangeable priesthood of Christ, His saving power to the uttermost, and the eternal life imparted to the believer.',
        'editorial_focus': 'Deep, inspirational, and consecrational teaching delivered at a national spiritual retreat, inspiring lasting spiritual stamina.',
        'approved_content': """TITLE: Walking in the Power of an Endless Life
THEME: The Eternal Priesthood and Sufficiency of Christ
TEXT: Hebrews 7:15-25; 2 Timothy 1:7-10
MINISTER: Pastor (Dr) W.F. Kumuyi
DATE: December 26, 2026

INTRODUCTION
The Epistle to the Hebrews reveals the transcendent superiority of the Lord Jesus Christ over all angels, prophets, Moses, and the Levitical priesthood. The Aaronic priests were mortal, subject to infirmity, and unable to make the comers thereunto perfect. But our Great High Priest, the Lord Jesus, is made not after the law of a carnal commandment, but after the power of an endless life. In this retreat message, the congregation is summoned to lay hold of this indestructible life and walk in the fullness of Christ's triumph.

1. THE ETERNAL PERFECTION OF CHRIST'S PRIESTHOOD (Hebrews 7:15-19)
The former commandment is set aside for the weakness and unprofitableness thereof, for the ceremonial law made nothing perfect. But the bringing in of a better hope did, by which we draw near unto God. Jesus is the Mediator of a better covenant established upon better promises. Because He continues ever, He hath an unchangeable priesthood. The believer no longer depends on earthly mediators or temporary sacrifices; he has direct, unhindered access to the Father through the Living Christ.

2. SAVING TO THE UTTERMOST ALL WHO DRAW NEAR (Hebrews 7:24-25; Romans 8:34)
Wherefore He is able also to save them to the uttermost that come unto God by Him, seeing He ever liveth to make intercession for them. 'To the uttermost' means from the lowest depths of sin to the highest heights of holiness; from the present hour into all eternity. He saves from the penalty of sin in justification, from the power of sin in sanctification, and from the presence of sin in future glorification. His active intercession at the right hand of God guarantees the final preservation of all steadfast saints.

3. THE LIFE OF DIVINE STAMINA AND UNWAVERING CONSECRATION (2 Timothy 1:7-10)
The power of an endless life within the believer expels the spirit of fear and replaces it with power, love, and a sound mind. Those who possess this life do not faint in adversity, nor do they compromise under persecutions. They possess spiritual stamina that outlasts all earthly pressures. They run the race with patience, keeping their eyes fixed upon Jesus, the Author and Finisher of their faith.

FINAL RETREAT ADMONITION
Let every believer step out of spiritual exhaustion into the vibrant power of the Living Christ. The Lord calls us to an unyielding consecration that will keep us steadfast until the Trumpet sounds.""",
    },
]


class ReportProcessingRepository:
    def __init__(self):
        self._initialized = False

    async def init_db(self):
        """Initializes the database schema and ensures seed standards and examples exist."""
        if self._initialized:
            return
        from app.database.models import (
            INIT_SCHEMA_SQL,
            INIT_SCHEMA_MSSQL,
            STAGE7_REPORT_PROCESSING_COLUMNS,
            STAGE7_REPORT_PROCESSING_COLUMNS_MSSQL,
        )

        is_mssql = bool(os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL").startswith("sqlite"))

        async with get_db_connection() as conn:
            if is_mssql:
                await conn.executescript(INIT_SCHEMA_MSSQL)
                for alter_sql in STAGE7_REPORT_PROCESSING_COLUMNS_MSSQL:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass
            else:
                await conn.executescript(INIT_SCHEMA_SQL)
                for alter_sql in STAGE7_REPORT_PROCESSING_COLUMNS:
                    try:
                        await conn.execute(alter_sql)
                    except Exception:
                        pass
            await conn.commit()

        await self._ensure_seed_data()
        self._initialized = True

    async def _ensure_seed_data(self):
        """Seeds Version 1 standards, Seed Examples AM, AN, AO, AP, and default settings."""
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            # 1. Default Settings
            cur = await conn.execute(
                "SELECT [key] FROM report_processing_settings WHERE [key] = ?",
                ('auto_process_after_verification',),
            )
            if not await cur.fetchone():
                await conn.execute(
                    """
                    INSERT INTO report_processing_settings ([key], [value], updated_at)
                    VALUES (?, ?, ?)
                    """,
                    ('auto_process_after_verification', 'true', now_iso),
                )

            # 2. Version 1 Standards
            cur = await conn.execute(
                "SELECT id FROM report_processing_standards WHERE version = 1"
            )
            if not await cur.fetchone():
                std_id = 'std_v1_seed'
                await conn.execute(
                    """
                    INSERT INTO report_processing_standards (
                        id, version, version_label, is_active,
                        reporter_extraction_instructions,
                        editorial_selection_instructions,
                        writing_instructions,
                        proofreading_instructions,
                        anti_slop_rules,
                        created_at, updated_at
                    ) VALUES (?, 1, 'v1.0 Standard Guidelines', 1, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        std_id,
                        DEFAULT_REPORTER_EXTRACTION_INSTRUCTIONS,
                        DEFAULT_EDITORIAL_SELECTION_INSTRUCTIONS,
                        DEFAULT_WRITING_INSTRUCTIONS,
                        DEFAULT_PROOFREADING_INSTRUCTIONS,
                        DEFAULT_ANTI_SLOP_RULES,
                        now_iso,
                        now_iso,
                    ),
                )

            # 3. Seed Examples (AM, AN, AO, AP)
            for ex in SEED_APPROVED_EXAMPLES:
                cur = await conn.execute(
                    "SELECT id FROM report_approved_examples WHERE id = ?",
                    (ex['id'],),
                )
                if not await cur.fetchone():
                    await conn.execute(
                        """
                        INSERT INTO report_approved_examples (
                            id, section_letter, section_name, title, theme,
                            scripture_reference, minister, service_date,
                            approved_content, teaching_goal, editorial_focus,
                            is_active, source_diff_id, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
                        """,
                        (
                            ex['id'],
                            ex['section_letter'],
                            ex['section_name'],
                            ex['title'],
                            ex.get('theme', ''),
                            ex.get('scripture_reference', ''),
                            ex.get('minister', ''),
                            ex.get('service_date', ''),
                            ex['approved_content'],
                            ex.get('teaching_goal', ''),
                            ex.get('editorial_focus', ''),
                            now_iso,
                            now_iso,
                        ),
                    )

            await conn.commit()

    # -------------------------------------------------------------------------
    # RUNS TRACKING & IDEMPOTENCY
    # -------------------------------------------------------------------------

    def _decorate_run(self, run):
        run["draft_report_id"] = run.get("final_report_id")
        run["review_status"] = "needs_review" if run.get("status") == "completed" else None
        return run

    async def get_active_run(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Returns an active, non-terminal run for the session if one is currently in progress.
        Prevents duplicate operations triggered by double-clicks or page reloads.
        """
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                """
                SELECT * FROM report_processing_runs
                WHERE session_id = ? AND status IN ('preparing_transcript', 'ai_processing', 'preparing_report')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (session_id,),
            )
            row = await cur.fetchone()
            return self._decorate_run(dict(row)) if row else None

    async def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM report_processing_runs WHERE run_id = ?",
                (run_id,),
            )
            row = await cur.fetchone()
            return self._decorate_run(dict(row)) if row else None

    async def get_latest_run_for_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                """
                SELECT * FROM report_processing_runs
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (session_id,),
            )
            row = await cur.fetchone()
            return self._decorate_run(dict(row)) if row else None

    async def create_run(self, session_id: str, run_id: Optional[str] = None) -> Dict[str, Any]:
        """Creates a new durable report processing run record in state preparing_transcript."""
        await self.init_db()
        now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        rid = run_id or f"run_{session_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO report_processing_runs (
                    run_id, session_id, status, current_step,
                    error_message, model_name, tokens_used,
                    reused_existing_material, created_at, updated_at
                ) VALUES (?, ?, 'preparing_transcript', 'preparing_transcript', NULL, NULL, 0, 0, ?, ?)
                """,
                (rid, session_id, now_iso, now_iso),
            )
            await conn.commit()

        # Update session table
        await session_repo.set_report_processing_status(session_id, 'preparing_transcript', run_id=rid)
        return (await self.get_run(rid)) or {}

    async def update_run_status(
        self,
        run_id: str,
        status: str,
        current_step: Optional[str] = None,
        error_message: Optional[str] = None,
        model_name: Optional[str] = None,
        tokens_used: Optional[int] = None,
        reused_existing_material: Optional[bool] = None,
        error_code: Optional[str] = None,
    ):
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        run = await self.get_run(run_id)
        if not run:
            return

        completed_at = now_iso if status in ('completed', 'failed', 'cancelled') else None

        async with get_db_connection() as conn:
            await conn.execute(
                """
                UPDATE report_processing_runs
                SET status = ?,
                    current_step = COALESCE(?, current_step),
                    error_message = COALESCE(?, error_message),
                    error_code = COALESCE(?, error_code),
                    model_name = COALESCE(?, model_name),
                    tokens_used = COALESCE(?, tokens_used),
                    reused_existing_material = COALESCE(?, reused_existing_material),
                    updated_at = ?,
                    completed_at = COALESCE(?, completed_at)
                WHERE run_id = ?
                """,
                (
                    status,
                    current_step,
                    error_message,
                    error_code,
                    model_name,
                    tokens_used,
                    (1 if reused_existing_material else 0) if reused_existing_material is not None else None,
                    now_iso,
                    completed_at,
                    run_id,
                ),
            )
            await conn.commit()

        # Keep sessions table aligned
        await session_repo.set_report_processing_status(
            run["session_id"], status, run_id=run_id
        )

    async def save_run_input(self, run_id, snapshot, compiled_prompt):
        """Record the actual generation input before invoking the provider."""
        from app.database.generation_source import digest
        await self.init_db()
        provenance = {**snapshot.provenance, 'prompt_hash': digest(compiled_prompt)}
        async with get_db_connection() as conn:
            await conn.execute("""UPDATE report_processing_runs SET generation_input_signature=?,
                input_snapshot_json=? WHERE run_id=?""",
                (snapshot.signature, json.dumps(provenance, sort_keys=True), run_id))
            await conn.commit()

    async def save_run_result(
        self,
        run_id: str,
        report_title: str,
        report_text: str,
        reporter_extraction: Dict[str, Any],
        editorial_selection: Dict[str, Any],
        writing: Dict[str, Any],
        proofreading: Dict[str, Any],
        validation_summary: Dict[str, Any],
        final_report_id: Optional[str] = None,
        model_name: Optional[str] = None,
        tokens_used: int = 0,
        reused_existing_material: bool = False,
        *, connection=None,
    ):
        if connection is None:
            await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with connection_scope(connection) as conn:
            cur = await conn.execute('SELECT * FROM report_processing_runs WHERE run_id=?', (run_id,))
            run = await cur.fetchone()
            if not run:
                raise ValueError('Report processing run no longer exists')
            await conn.execute(
                """
                UPDATE report_processing_runs
                SET status = 'completed',
                    current_step = 'completed',
                    report_title = ?,
                    report_text = ?,
                    reporter_extraction_json = ?,
                    editorial_selection_json = ?,
                    writing_json = ?,
                    proofreading_json = ?,
                    validation_summary_json = ?,
                    final_report_id = ?,
                    model_name = COALESCE(?, model_name),
                    tokens_used = ?,
                    reused_existing_material = ?,
                    updated_at = ?,
                    completed_at = ?
                WHERE run_id = ?
                """,
                (
                    report_title,
                    report_text,
                    json.dumps(reporter_extraction or {}),
                    json.dumps(editorial_selection or {}),
                    json.dumps(writing or {}),
                    json.dumps(proofreading or {}),
                    json.dumps(validation_summary or {}),
                    final_report_id,
                    model_name,
                    tokens_used,
                    1 if reused_existing_material else 0,
                    now_iso,
                    now_iso,
                    run_id,
                ),
            )
            await conn.execute("""UPDATE sessions SET report_processing_status='completed',
                report_processing_run_id=?, report_processing_completed_at=? WHERE session_id=?""",
                (run_id, now_iso, run['session_id']))
            if connection is None:
                await conn.commit()

    async def cancel_run(self, run_id: str) -> bool:
        await self.init_db()
        run = await self.get_run(run_id)
        if not run or run["status"] in ('completed', 'failed', 'cancelled'):
            return False

        await self.update_run_status(
            run_id, status='cancelled', current_step='cancelled', error_message='Cancelled by user'
        )
        return True

    # -------------------------------------------------------------------------
    # STANDARDS & INSTRUCTIONS VERSIONING
    # -------------------------------------------------------------------------

    async def get_active_standard_raw(self) -> Dict[str, Any]:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                """
                SELECT * FROM report_processing_standards
                WHERE is_active = 1
                ORDER BY version DESC
                LIMIT 1
                """
            )
            row = await cur.fetchone()
            if row:
                return dict(row)
            # Fallback to latest version
            cur2 = await conn.execute(
                "SELECT * FROM report_processing_standards ORDER BY version DESC LIMIT 1"
            )
            row2 = await cur2.fetchone()
            return dict(row2) if row2 else {}

    async def get_active_standard(self) -> Dict[str, Any]:
        res = await self.get_active_standard_raw()
        if res:
            unified = await self.get_active_unified_instruction()
            res["unified_instructions"] = unified
            res["instruction"] = unified
        return res

    async def get_active_unified_instruction(self) -> str:
        """
        Returns the authoritative unified instruction for report processing.
        Priority:
        1. Custom saved instruction in report_processing_settings table ('unified_instructions' or 'instruction')
        2. Assembled instructions from the active report_processing_standards record
        3. Default unified instruction template
        """
        await self.init_db()
        saved = await self.get_setting("unified_instructions")
        if not (saved and saved.strip()):
            saved = await self.get_setting("instruction")
        if saved and saved.strip():
            return saved.strip()

        std = await self.get_active_standard_raw()
        parts = []
        if std.get("anti_slop_rules"):
            parts.append(f"ANTI-AI-SLOP RULES & TONE MANDATE (ZERO TOLERANCE):\n{std['anti_slop_rules'].strip()}")
        if std.get("reporter_extraction_instructions"):
            parts.append(f"1. REPORTER EXTRACTION STANDARDS:\n{std['reporter_extraction_instructions'].strip()}")
        if std.get("editorial_selection_instructions"):
            parts.append(f"2. EDITORIAL SELECTION STANDARDS (KEEP / COMPRESS / OMIT):\n{std['editorial_selection_instructions'].strip()}")
        if std.get("writing_instructions"):
            parts.append(f"3. INFORMATION UNIT WRITING STANDARDS:\n{std['writing_instructions'].strip()}")
        if std.get("proofreading_instructions"):
            parts.append(f"4. PROOFREADING & VALIDATION STANDARDS:\n{std['proofreading_instructions'].strip()}")

        if parts:
            return "\n\n".join(parts)

        return f"""ANTI-AI-SLOP RULES & TONE MANDATE (ZERO TOLERANCE):
{DEFAULT_ANTI_SLOP_RULES}

1. REPORTER EXTRACTION STANDARDS:
{DEFAULT_REPORTER_EXTRACTION_INSTRUCTIONS}

2. EDITORIAL SELECTION STANDARDS (KEEP / COMPRESS / OMIT):
{DEFAULT_EDITORIAL_SELECTION_INSTRUCTIONS}

3. INFORMATION UNIT WRITING STANDARDS:
{DEFAULT_WRITING_INSTRUCTIONS}

4. PROOFREADING & VALIDATION STANDARDS:
{DEFAULT_PROOFREADING_INSTRUCTIONS}"""

    async def save_active_unified_instruction(self, instruction: str) -> str:
        """
        Persists the authoritative unified report processing instruction.
        Saves persistently to report_processing_settings so both SQLite and MSSQL store it reliably.
        """
        await self.init_db()
        cleaned = instruction.strip()
        await self.set_setting("unified_instructions", cleaned)
        await self.set_setting("instruction", cleaned)
        return cleaned

    async def get_standard_by_version(self, version: int) -> Optional[Dict[str, Any]]:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM report_processing_standards WHERE version = ?",
                (version,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None

    async def list_standards(self) -> List[Dict[str, Any]]:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM report_processing_standards ORDER BY version DESC"
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

    async def create_standard(
        self,
        version_label: str,
        reporter_extraction_instructions: str,
        editorial_selection_instructions: str,
        writing_instructions: str,
        proofreading_instructions: str,
        anti_slop_rules: str,
        is_active: bool = True,
    ) -> Dict[str, Any]:
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        async with get_db_connection() as conn:
            # Determine next version
            cur = await conn.execute("SELECT MAX(version) FROM report_processing_standards")
            max_v = (await cur.fetchone())[0] or 0
            new_version = max_v + 1
            std_id = f"std_v{new_version}_{uuid.uuid4().hex[:6]}"

            if is_active:
                await conn.execute("UPDATE report_processing_standards SET is_active = 0")

            await conn.execute(
                """
                INSERT INTO report_processing_standards (
                    id, version, version_label, is_active,
                    reporter_extraction_instructions,
                    editorial_selection_instructions,
                    writing_instructions,
                    proofreading_instructions,
                    anti_slop_rules,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    std_id,
                    new_version,
                    version_label,
                    1 if is_active else 0,
                    reporter_extraction_instructions,
                    editorial_selection_instructions,
                    writing_instructions,
                    proofreading_instructions,
                    anti_slop_rules,
                    now_iso,
                    now_iso,
                ),
            )
            await conn.commit()

        return (await self.get_standard_by_version(new_version)) or {}

    async def set_active_standard(self, version: int) -> bool:
        await self.init_db()
        async with get_db_connection() as conn:
            await conn.execute("UPDATE report_processing_standards SET is_active = 0")
            await conn.execute(
                "UPDATE report_processing_standards SET is_active = 1 WHERE version = ?",
                (version,),
            )
            await conn.commit()
        return True

    # -------------------------------------------------------------------------
    # APPROVED EXAMPLES LIBRARY
    # -------------------------------------------------------------------------

    async def list_approved_examples(
        self,
        section_letter: Optional[str] = None,
        active_only: bool = True,
    ) -> List[Dict[str, Any]]:
        await self.init_db()
        async with get_db_connection() as conn:
            query = "SELECT * FROM report_approved_examples WHERE 1=1"
            params = []
            if active_only:
                query += " AND is_active = 1"
            if section_letter:
                query += " AND section_letter = ?"
                params.append(section_letter.upper())

            query += " ORDER BY section_letter ASC, created_at ASC"
            cur = await conn.execute(query, params)
            rows = await cur.fetchall()
            return [dict(r) for r in rows]

    async def get_approved_example(self, example_id: str) -> Optional[Dict[str, Any]]:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM report_approved_examples WHERE id = ?",
                (example_id,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None

    async def create_approved_example(
        self,
        section_letter: str,
        section_name: str,
        title: str,
        approved_content: str,
        theme: Optional[str] = None,
        scripture_reference: Optional[str] = None,
        minister: Optional[str] = None,
        service_date: Optional[str] = None,
        teaching_goal: Optional[str] = None,
        editorial_focus: Optional[str] = None,
        source_diff_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        ex_id = f"ex_{section_letter.lower()}_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO report_approved_examples (
                    id, section_letter, section_name, title, theme,
                    scripture_reference, minister, service_date,
                    approved_content, teaching_goal, editorial_focus,
                    is_active, source_diff_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    ex_id,
                    section_letter.upper(),
                    section_name,
                    title,
                    theme or '',
                    scripture_reference or '',
                    minister or '',
                    service_date or '',
                    approved_content,
                    teaching_goal or '',
                    editorial_focus or '',
                    source_diff_id,
                    now_iso,
                    now_iso,
                ),
            )
            await conn.commit()

        return (await self.get_approved_example(ex_id)) or {}

    # -------------------------------------------------------------------------
    # HUMAN DIFFS & REINFORCEMENT LEARNING
    # -------------------------------------------------------------------------

    async def save_human_diff(
        self,
        session_id: str,
        original_ai_text: str,
        human_edited_text: str,
        run_id: Optional[str] = None,
        diff_summary: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        diff_id = f"diff_{session_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        async with get_db_connection() as conn:
            await conn.execute(
                """
                INSERT INTO report_human_diffs (
                    id, session_id, run_id, original_ai_text,
                    human_edited_text, diff_summary_json,
                    is_promoted_to_example, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    diff_id,
                    session_id,
                    run_id,
                    original_ai_text,
                    human_edited_text,
                    json.dumps(diff_summary or {}),
                    now_iso,
                ),
            )
            await conn.commit()

        return {
            'id': diff_id,
            'session_id': session_id,
            'run_id': run_id,
            'is_promoted_to_example': 0,
            'created_at': now_iso,
        }

    async def promote_diff_to_example(
        self,
        diff_id: str,
        section_letter: str,
        section_name: str,
        title: str,
        teaching_goal: Optional[str] = None,
        editorial_focus: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Promotes a human edit diff to an approved exemplar in the few-shot library."""
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                "SELECT * FROM report_human_diffs WHERE id = ?",
                (diff_id,),
            )
            row = await cur.fetchone()
            if not row:
                raise ValueError(f"Diff {diff_id} not found")

            diff = dict(row)
            session = await session_repo.get_session(diff["session_id"])
            minister = session.get("minister") if session else ""
            service_date = session.get("date_created", "")[:10] if session else ""

            example = await self.create_approved_example(
                section_letter=section_letter,
                section_name=section_name,
                title=title,
                approved_content=diff["human_edited_text"],
                minister=minister,
                service_date=service_date,
                teaching_goal=teaching_goal,
                editorial_focus=editorial_focus,
                source_diff_id=diff_id,
            )

            await conn.execute(
                "UPDATE report_human_diffs SET is_promoted_to_example = 1 WHERE id = ?",
                (diff_id,),
            )
            await conn.commit()

            return example

    # -------------------------------------------------------------------------
    # SETTINGS
    # -------------------------------------------------------------------------

    async def get_setting(self, key: str, default: Optional[str] = None) -> str:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute(
                "SELECT [value] FROM report_processing_settings WHERE [key] = ?",
                (key,),
            )
            row = await cur.fetchone()
            if row and row["value"] is not None:
                return str(row["value"])
            if default is not None:
                return default
            if key == "auto_continue_to_proofreading":
                return "false"
            if key == "auto_process_after_verification":
                return "true"
            return ''

    async def set_setting(self, key: str, value: str):
        await self.init_db()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        async with get_db_connection() as conn:
            cur = await conn.execute(
                "SELECT [key] FROM report_processing_settings WHERE [key] = ?",
                (key,),
            )
            if await cur.fetchone():
                await conn.execute(
                    """
                    UPDATE report_processing_settings
                    SET [value] = ?, updated_at = ?
                    WHERE [key] = ?
                    """,
                    (str(value), now_iso, key),
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO report_processing_settings ([key], [value], updated_at)
                    VALUES (?, ?, ?)
                    """,
                    (key, str(value), now_iso),
                )
            await conn.commit()

    async def get_all_settings(self) -> Dict[str, str]:
        await self.init_db()
        async with get_db_connection() as conn:
            cur = await conn.execute("SELECT [key], [value] FROM report_processing_settings")
            rows = await cur.fetchall()
            settings = {r["key"]: r["value"] for r in rows}
            if "auto_process_after_verification" not in settings:
                settings["auto_process_after_verification"] = "true"
            settings.setdefault("auto_continue_to_proofreading", "false")
            return settings

    # -------------------------------------------------------------------------
    # COMPLETED REPORTS ARCHIVE
    # -------------------------------------------------------------------------

    async def list_completed_reports(
        self,
        search: Optional[str] = None,
        programme: Optional[str] = None,
        session_type: Optional[str] = None,
        minister: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Queries all finalized reports across the archive with filtering.
        Merges completed final_reports records with active report_processing_runs.
        """
        await self.init_db()
        async with get_db_connection() as conn:
            query = """
                SELECT
                    fr.id as final_report_id,
                    fr.session_id,
                    fr.report_title,
                    fr.report_text,
                    fr.minister,
                    fr.programme,
                    fr.service_date,
                    fr.docx_filename,
                    fr.docx_file_size,
                    fr.created_at,
                    s.title as session_title,
                    s.duration_seconds,
                    s.audio_duration_seconds,
                    rpr.run_id as report_processing_run_id,
                    rpr.status as run_status, fr.id, fr.is_active, fr.approval_status,
                    fr.approved_at, fr.source_run_id, fr.source_signature, fr.proofread_report_revision_id, s.is_archived
                FROM final_reports fr
                JOIN sessions s ON fr.session_id = s.session_id
                LEFT JOIN report_processing_runs rpr ON fr.source_run_id = rpr.run_id
                WHERE fr.is_active = 1 AND s.is_archived = 0
            """
            params = []

            if search and search.strip():
                clean_search = f"%{search.strip()}%".lower()
                query += """ AND (
                    LOWER(fr.report_title) LIKE ? OR
                    LOWER(fr.report_text) LIKE ? OR
                    LOWER(COALESCE(fr.minister, '')) LIKE ? OR
                    LOWER(s.title) LIKE ?
                )"""
                params.extend([clean_search, clean_search, clean_search, clean_search])

            if programme and programme.strip() and programme.strip() != 'all':
                query += " AND (LOWER(COALESCE(fr.programme, '')) = LOWER(?) OR LOWER(s.title) LIKE ?)"
                params.extend([programme.strip(), f"%{programme.strip()}%"])

            if minister and minister.strip() and minister.strip() != 'all':
                query += " AND LOWER(COALESCE(fr.minister, '')) = LOWER(?)"
                params.append(minister.strip())

            if date_from and date_from.strip():
                query += " AND (COALESCE(fr.service_date, fr.created_at) >= ?)"
                params.append(date_from.strip())

            if date_to and date_to.strip():
                query += " AND (COALESCE(fr.service_date, fr.created_at) <= ?)"
                params.append(date_to.strip())

            is_mssql = bool(os.environ.get("DATABASE_URL") and not os.environ.get("DATABASE_URL").startswith("sqlite"))
            if is_mssql:
                query += " ORDER BY fr.created_at DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
                params.extend([offset, limit])
            else:
                query += " ORDER BY fr.created_at DESC LIMIT ? OFFSET ?"
                params.extend([limit, offset])

            cur = await conn.execute(query, params)
            rows = await cur.fetchall()
            from app.database.final_report_repo import final_report_repo
            return [await final_report_repo._decorate(conn, r) for r in rows]


report_processing_repo = ReportProcessingRepository()
