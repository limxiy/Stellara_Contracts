const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MultisigTreasury", function () {
  let owner0, owner1, owner2, recipient;
  let treasury;

  beforeEach(async () => {
    [owner0, owner1, owner2, recipient] = await ethers.getSigners();
    const owners = [owner0.address, owner1.address, owner2.address];
    const Multisig = await ethers.getContractFactory("MultisigTreasury");
    treasury = await Multisig.deploy(owners, 2, ethers.utils.parseEther("1"), ethers.utils.parseEther("10"), ethers.utils.parseEther("2"));
    await treasury.deployed();

    // Fund contract
    await owner0.sendTransaction({ to: treasury.address, value: ethers.utils.parseEther("5") });
  });

  it("executes a small single-confirm transaction", async () => {
    const value = ethers.utils.parseEther("0.5");
    await treasury.connect(owner0).submitTransaction(recipient.address, value, '0x');
    const count = await treasury.getTransactionCount();
    const idx = count.sub(1);
    await treasury.connect(owner0).confirmTransaction(idx);
    const before = await ethers.provider.getBalance(recipient.address);
    await treasury.connect(owner0).executeTransaction(idx);
    const after = await ethers.provider.getBalance(recipient.address);
    expect(after.sub(before)).to.equal(value);
  });

  it("requires multisig for large transactions above threshold", async () => {
    const value = ethers.utils.parseEther("3"); // threshold set to 2
    await treasury.connect(owner0).submitTransaction(recipient.address, value, '0x');
    const count = await treasury.getTransactionCount();
    const idx = count.sub(1);
    // single confirm should not be enough
    await treasury.connect(owner0).confirmTransaction(idx);
    await expect(treasury.connect(owner0).executeTransaction(idx)).to.be.revertedWith("insufficient confirmations for large tx");

    // second confirm
    await treasury.connect(owner1).confirmTransaction(idx);
    const before = await ethers.provider.getBalance(recipient.address);
    await treasury.connect(owner0).executeTransaction(idx);
    const after = await ethers.provider.getBalance(recipient.address);
    expect(after.sub(before)).to.equal(value);
  });

  it("supports emergency freeze and multisig unfreeze", async () => {
    // Freeze immediately by one owner
    await treasury.connect(owner0).emergencyFreeze();
    // Submit a small tx while frozen
    await treasury.connect(owner0).submitTransaction(recipient.address, ethers.utils.parseEther("0.1"), '0x');
    const count = await treasury.getTransactionCount();
    const idx = count.sub(1);
    await treasury.connect(owner0).confirmTransaction(idx);
    await expect(treasury.connect(owner0).executeTransaction(idx)).to.be.revertedWith("frozen");

    // Submit an unfreeze internal transaction that will be enforced by multisig
    const data = treasury.interface.encodeFunctionData("unfreezeInternal");
    await treasury.connect(owner0).submitTransaction(treasury.address, 0, data);
    const count2 = await treasury.getTransactionCount();
    const idx2 = count2.sub(1);
    await treasury.connect(owner0).confirmTransaction(idx2);
    await treasury.connect(owner1).confirmTransaction(idx2);
    // execute unfreeze (requires full multisig as implemented)
    await treasury.connect(owner0).executeTransaction(idx2);

    // Now executing the previous tx should work after unfreeze
    await treasury.connect(owner0).executeTransaction(idx);
    const recipientBalance = await ethers.provider.getBalance(recipient.address);
    expect(recipientBalance).to.equal(ethers.utils.parseEther("0.1"));
  });
});
