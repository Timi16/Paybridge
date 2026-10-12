"use client";

import Link from "next/link";
import { Burst } from "@/app/(auth)/_ui/AuthCentred";
import { Icon } from "@/components/Icon";
import { useNewRequest } from "@/components/NewRequest";
import { shortAddress } from "@/lib/format";
import type { Merchant, Wallet } from "@/lib/types";
import styles from "../onboarding.module.css";

function assetLine(merchant: Merchant): string {
  const other = merchant.defaultAsset === "USDC" ? "XLM" : "USDC";
  return merchant.acceptedAssets === "BOTH" ? `${merchant.defaultAsset} (${other} accepted too)` : merchant.defaultAsset;
}

export function StepDone({ merchant, wallets, className }: { merchant: Merchant; wallets: Wallet[]; className: string }) {
  const newRequest = useNewRequest();
  const wallet = wallets.find((w) => w.id === merchant.defaultWalletId) ?? wallets[0];

  return (
    <div className={className}>
      <div className={styles.head}>
        <h1 className="h1">You are set up</h1>
        <span className="sub">Test mode is on. Here is what you can do first.</span>
      </div>
      <div className={styles.summary}>
        <Burst size={44} />
        <div className={styles.summaryText}>
          <span style={{ fontWeight: 800, overflowWrap: "anywhere" }}>
            {merchant.businessName}
            {wallet ? (
              <>
                {" "}
                · settles to{" "}
                <span className="mono" style={{ fontWeight: 600 }} title={wallet.address}>
                  {shortAddress(wallet.address)}
                </span>
              </>
            ) : null}
          </span>
          <span style={{ fontSize: 13, color: "var(--slate)" }}>{assetLine(merchant)} on Stellar Testnet · we watch this account for payments with your memos</span>
        </div>
      </div>
      <div className={`${styles.cards} stagger`}>
        <button type="button" className={`card lift ${styles.tile}`} onClick={() => newRequest()}>
          <span className={styles.tileIcon}>
            <Icon name="plus" size={20} />
          </span>
          <span style={{ fontWeight: 800 }}>Create a request</span>
          <span className={styles.tileSub}>Amount, asset, wallet → link.</span>
        </button>
        <Link href="/settings" className={`card lift ${styles.tile}`}>
          <span className={styles.tileIcon}>
            <Icon name="wallets" size={20} />
          </span>
          <span style={{ fontWeight: 800 }}>Add more wallets</span>
          <span className={styles.tileSub}>Pick a receiving wallet per request.</span>
        </Link>
        <button type="button" className={`card lift ${styles.tile}`} onClick={() => newRequest()}>
          <span className={styles.tileIcon}>
            <Icon name="qr" size={20} />
          </span>
          <span style={{ fontWeight: 800 }}>Try the pay page</span>
          <span className={styles.tileSub}>Create a request, then open its link to see what your customer sees. Pay it yourself with Friendbot money.</span>
        </button>
      </div>
      <div className={styles.actions}>
        <Link href="/dashboard" className="btn btn-primary" style={{ fontSize: 15 }}>
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
