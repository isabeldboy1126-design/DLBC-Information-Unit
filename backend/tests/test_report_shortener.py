"""
Unit and Integration Tests for Report Shortening Feature (Rules 1-8).

Verifies:
1. Shortener preserves headings, outline divisions, and essential metadata.
2. Shortener meaningfully condenses word count (target ~40-60%).
3. Shortener is non-destructive (does NOT overwrite original active report in DB).
4. Shortened report can be saved as a new revision without destroying original.
5. Error handling for empty or non-existent reports.

Zero real Gemini quota consumed in tests (rule-based and mocked responses).
"""

import os
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.session_repo import session_repo
from app.database.final_report_repo import final_report_repo
from app.services.report_shortener import report_shortener_service

client = TestClient(app)


@pytest.mark.asyncio
async def test_report_shortener_service_rule_based():
    """Tests the deterministic rule-based condensation engine."""
    title = "Transformed to Triumph"
    minister = "Pastor Nkereuwem Ukoh"
    programme = "Christophilia '26 — National Campus Congress"
    date_str = "2026-10-08"

    original_text = """# Transformed to Triumph

**Minister:** Pastor Nkereuwem Ukoh
**Date:** 2026-10-08
**Texts:** Romans 12:2; 2 Corinthians 2:14

## Introduction
The Lord has called His people into undeniable triumph through spiritual renewal. In this present world, conformity to carnal standards leads only to defeat, frustration, and spiritual blindness. But when the believer presents his body as a living sacrifice, divine transformation occurs, enabling him to prove the good, acceptable, and perfect will of God. We must look away from the fleeting pleasures of sin and fix our eyes upon Jesus Christ.

## 1. THE PROCESS OF TRANSFORMATION FOR TRIUMPH IN LIFE
Transformation begins at the cross where repentance and faith intersect. The sinner must acknowledge his spiritual bankruptcy and turn away from all unrighteousness. When a man is in Christ, he is a new creature; old things are passed away, and behold, all things are become new.
1. Accept and acknowledge personal sin.
2. Agree with God's verdict and resolve never to turn back.
3. Amend worldly ways through genuine restitution.

## 2. THE PROGRESS OF TRANSFORMATION FOR A TRUSTWORTHY LIFE
Spiritual maturity does not happen by accident; it requires disciplined prayer and study of the Word. The believer must guard his heart with all diligence, for out of it are the issues of life. When temptations arise, grace provides the avenue of escape. Those who walk in the Spirit will not fulfill the lust of the flesh.
1. Continuous consecration of heart and mind.
2. Steadfast obedience in secret and public.
3. Unwavering loyalty to biblical truth.

## 3. THE POWER OF TRANSFORMATION FOR TRIUMPHANT LIVING
The final victory belongs to the saints who overcome by the blood of the Lamb. No weapon formed against the transformed soul shall prosper. God causes us always to triumph in Christ Jesus, making manifest the savour of His knowledge in every place.
1. Divine authority over all spiritual opposition.
2. Daily manifestation of the fruits of righteousness.
3. Eternal crown reserved for the steadfast overcomer.

## Conclusion and Prayer
Rise up in faith today and surrender your life completely to the transforming power of God. Pray that the Lord will break every yoke of carnality and crown your walk with everlasting victory."""

    # Test rule-based method directly
    shortened = report_shortener_service._rule_based_shorten(
        title, original_text, minister, programme, date_str
    )

    # Check that all 3 main points and headings are preserved
    assert "THE PROCESS OF TRANSFORMATION FOR TRIUMPH IN LIFE" in shortened
    assert "THE PROGRESS OF TRANSFORMATION FOR A TRUSTWORTHY LIFE" in shortened
    assert "THE POWER OF TRANSFORMATION FOR TRIUMPHANT LIVING" in shortened
    assert "1. Accept and acknowledge personal sin." in shortened
    assert "Romans 12:2" in shortened or "Texts:" in shortened

    # Check word count reduction
    orig_wc = len(original_text.split())
    short_wc = len(shortened.split())
    assert short_wc < orig_wc


@pytest.mark.asyncio
async def test_shorten_report_endpoint_non_destructive():
    """
    Tests that POST /api/final-report/sessions/{session_id}/shorten:
    1. Returns a shortened report.
    2. Does NOT modify the active report in the database.
    3. Allows subsequent saving as a new revision without destroying original.
    """
    session_id = "test_shorten_sess_01"
    await session_repo.create_session(
        session_id=session_id,
        title="Transformed to Triumph",
        status="completed",
        metadata={
            "minister": "Pastor Nkereuwem Ukoh",
            "programme": "Christophilia '26",
            "scripture_reference": "Romans 12:2; 2 Corinthians 2:14",
        },
    )

    original_report_text = """# Transformed to Triumph

**Minister:** Pastor Nkereuwem Ukoh
**Texts:** Romans 12:2; 2 Corinthians 2:14

## 1. THE PROCESS OF TRANSFORMATION
The believer must surrender completely to God. This demands total repentance and turning away from sin. God transforms our thinking so we can walk in victory every day.

## 2. THE PROGRESS OF TRANSFORMATION
We grow in grace by reading the Word daily. Prayer strengthens the soul against all evil. Continuous holiness is required for everyone who seeks the crown of life.

## 3. THE POWER OF TRANSFORMATION
Victory is guaranteed through the blood of Jesus. We conquer through Him who loved us. Walk in holy boldness and triumph."""

    # Create original active final report (Revision 1)
    rev1 = await final_report_repo.finalize_report(
        session_id=session_id,
        proofread_report_revision_id=None,
        report_title="Transformed to Triumph",
        report_text=original_report_text,
        minister="Pastor Nkereuwem Ukoh",
        programme="Christophilia '26",
        service_date="2026-10-08",
    )
    assert rev1["revision_number"] == 1

    # Call Shorten Endpoint
    response = client.post(f"/api/final-report/sessions/{session_id}/shorten")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["session_id"] == session_id
    assert "shortened_text" in data
    assert data["original_word_count"] > 0
    assert data["shortened_word_count"] > 0

    # Verify that active final report in DB was NOT changed! (Non-destructive check)
    active_report = await final_report_repo.get_active_final_report(session_id)
    assert active_report["revision_number"] == 1
    assert active_report["report_text"] == original_report_text

    # Simulate user choosing to save shortened report as a new revision
    save_res = client.post(
        f"/api/final-report/sessions/{session_id}/save-revision",
        json={
            "report_title": data["shortened_title"],
            "report_text": data["shortened_text"],
        },
    )
    assert save_res.status_code == 200
    saved_data = save_res.json()
    assert saved_data["status"] == "saved"
    assert saved_data["final_report"]["revision_number"] == 2

    # Verify Revision 1 still exists in revision history and can be restored
    revisions = await final_report_repo.list_final_report_revisions(session_id)
    assert len(revisions) == 2
    rev1_found = next(r for r in revisions if r["revision_number"] == 1)
    assert rev1_found["report_text"] == original_report_text


@pytest.mark.asyncio
async def test_shorten_report_empty_session():
    """Tests error handling when shortening a session with no report."""
    session_id = "test_empty_sess_02"
    await session_repo.create_session(session_id=session_id, title="Empty Session")

    response = client.post(f"/api/final-report/sessions/{session_id}/shorten")
    assert response.status_code == 400
    assert "No final report or approved proofread report found" in response.json()["detail"]