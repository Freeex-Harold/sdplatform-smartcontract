const GIV = artifacts.require('GIV');
const { BN, ether, constants, time, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

contract('GIV', accounts => {
  let giv;
  const owner = accounts[0];
  const receiver = accounts[1];
  const spender = accounts[2];
  const account = accounts[3];
  const lockReason = web3.utils.asciiToHex('GIV');
  const lockReason2 = web3.utils.asciiToHex('CLAIM');
  const lockReason3 = web3.utils.asciiToHex('VESTED');
  const lockedAmount = ether('200');
  const lockPeriod = 1000;
  const approveAmount = ether('100');
  const increaseTime = async (duration) => {
    await time.increase(duration);
  };

  before(async () => {
    giv = await GIV.new({ from: owner });
  });

  it('can be created', () => {
    assert.ok(giv);
  });

  it('has the right balance for the contract owner', async () => {
    const supply = ether('3500000000');
    const name = 'SDPlatform GIV Token';
    const symbol = 'GIV';
    const decimals = new BN(18);

    const balance = await giv.balanceOf(owner);
    const totalBalance = await giv.totalBalanceOf(owner);
    const totalSupply = await giv.totalSupply();
    const tokenName = await giv.name();
    const tokenSymbol = await giv.symbol();
    const tokenDecimals = await giv.decimals();

    expect(totalSupply).to.be.bignumber.equal(supply);
    expect(balance).to.be.bignumber.equal(totalSupply);
    expect(totalBalance).to.be.bignumber.equal(totalSupply);
    assert.equal(tokenName, name);
    assert.equal(tokenSymbol, symbol);
    expect(tokenDecimals).to.be.bignumber.equal(decimals);
  });

  it('reduces locked tokens from transferable balance', async () => {
    const origBalance = await giv.balanceOf(owner);
    const blockNumber = await web3.eth.getBlockNumber();
    const newLockTimestamp = await web3.eth.getBlock(blockNumber);
    
    await giv.lock(lockReason, lockedAmount, lockPeriod);
    const balance = await giv.balanceOf(owner);
    const totalBalance = await giv.totalBalanceOf(owner);
    const lockAndUseableBalance = web3.utils.toBN(balance.toString()).add(web3.utils.toBN(lockedAmount));

    expect(origBalance).to.be.bignumber.equal(totalBalance);
    expect(origBalance).to.be.bignumber.equal(lockAndUseableBalance);
    let actualLockedAmount = await giv.tokensLocked(owner, lockReason);
    expect(lockedAmount).to.be.bignumber.equal(actualLockedAmount);
    actualLockedAmount = await giv.tokensLockedAtTime(owner, lockReason, newLockTimestamp.timestamp + lockPeriod + 1)
    assert.equal(0, actualLockedAmount.toNumber());

    const transferAmount = ether('500');
    const { logs } = await giv.transfer(receiver, transferAmount, { from: owner });
    const newSenderBalance = await giv.balanceOf(owner);
    const newReceiverBalance = await giv.balanceOf(receiver);
    const ownerUserabledBalance = web3.utils.toBN(newSenderBalance.toString()).add(web3.utils.toBN(transferAmount));
    expect(newReceiverBalance).to.be.bignumber.equal(transferAmount);
    expect(balance).to.be.bignumber.equal(ownerUserabledBalance);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, 'Transfer');
    assert.equal(logs[0].args.from, owner);
    assert.equal(logs[0].args.to, receiver);
    assert(logs[0].args.value.eq(transferAmount));
  });

  it('reverts locking more tokens via lock function', async () => {
    const balance = await giv.balanceOf(owner);
    await expectRevert(giv.lock(lockReason, balance, lockPeriod), 'Tokens already locked');
  });

  it('can extend lock period for an existing lock', async () => {
    await giv.tokensLocked(owner, lockReason);
    const lockValidityOrig = await giv.locked(owner, lockReason);
    await giv.extendLock(lockReason, lockPeriod);
    const lockValidityExtended = await giv.locked(owner, lockReason);
    assert.equal(lockValidityExtended[1].toNumber(), lockValidityOrig[1].toNumber() + lockPeriod);
    await expectRevert(giv.extendLock(lockReason2, lockPeriod), 'No tokens locked');
    await expectRevert(giv.increaseLockAmount(lockReason2, lockPeriod), 'No tokens locked');
  });

  it('can increase the number of tokens locked', async () => {
    const actualLockedAmount = await giv.tokensLocked(owner, lockReason);
    await giv.increaseLockAmount(lockReason, lockedAmount);
    const increasedLockAmount = await giv.tokensLocked(owner, lockReason);
    const validLockedAmount = web3.utils.toBN(actualLockedAmount.toString()).add(web3.utils.toBN(lockedAmount));
    expect(increasedLockAmount).to.be.bignumber.equal(validLockedAmount);
  });

  it('cannot transfer tokens to null address', async () => {
    await expectRevert(giv.transfer(constants.ZERO_ADDRESS, ether('100'), { from: owner }), 'ERC20: transfer to the zero address');
  });

  it('cannot transfer tokens greater than transferable balance', async () => {
    const balance = await giv.balanceOf(owner);
    const newBalance = web3.utils.toBN(balance.toString()).add(web3.utils.toBN('1'));
    await expectRevert(giv.transfer(receiver, newBalance, { from: owner }), 'ERC20: transfer amount exceeds balance');
  });

  it('can approve transfer to a spender', async () => {
    const initialAllowance = await giv.allowance(owner, spender);
    await giv.approve(spender, approveAmount);
    const newAllowance = await giv.allowance(owner, spender);
    const validAllowance = web3.utils.toBN(initialAllowance.toString()).add(web3.utils.toBN(approveAmount));

    expect(newAllowance).to.be.bignumber.equal(validAllowance);
  });

  it('cannot transfer tokens from an address greater than allowance', async () => {
    const newAllowance = web3.utils.toBN(approveAmount).add(web3.utils.toBN('100'));
    await expectRevert(giv.transferFrom(owner, receiver, newAllowance, { from: spender }), 'ERC20: transfer amount exceeds allowance');
  });

  it('cannot transfer tokens from an address to null address', async () => {
    await expectRevert(giv.transferFrom(owner, constants.ZERO_ADDRESS, ether('100')), 'ERC20: transfer to the zero address');
  });

  it('cannot transfer tokens from an address greater than owners balance', async () => {
    const balance = await giv.balanceOf(owner);
    await giv.approve(spender, balance);
    const newAmount = web3.utils.toBN(balance.toString()).add(web3.utils.toBN('100'));
    await expectRevert(giv.transferFrom(owner, receiver, newAmount, { from: spender }), 'ERC20: transfer amount exceeds balance');
  });

  it('can transfer tokens from an address less than owners balance', async () => {
    const balance = await giv.balanceOf(owner);
    await giv.approve(spender, balance);
    const newAmount = web3.utils.toBN(balance.toString()).sub(web3.utils.toBN(ether('30000')));
    const { logs } = await giv.transferFrom(owner, receiver, newAmount, { from: spender });
    const newBalance = web3.utils.toBN(balance.toString()).sub(web3.utils.toBN(newAmount));
    assert.equal(logs.length, 2);
    assert.equal(logs[0].event, 'Transfer');
    assert.equal(logs[0].args.from, owner);
    assert.equal(logs[0].args.to, receiver);
    assert(logs[0].args.value.eq(newAmount));
    assert.equal(logs[1].event, 'Approval');
    assert.equal(logs[1].args.owner, owner);
    assert.equal(logs[1].args.spender, spender);
    assert(logs[1].args.value.eq(newBalance));
  });

  it('can unLockTokens', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    const lockTimestamp = await web3.eth.getBlock(blockNumber);
    const lockValidityExtended = await giv.locked(owner, lockReason);
    const balance = await giv.balanceOf(owner);
    const tokensLocked = await giv.tokensLockedAtTime(owner, lockReason, lockTimestamp.timestamp);
    await increaseTime(lockValidityExtended[1].toNumber() + 60 - lockTimestamp.timestamp);
    let unlockableToken = await giv.getUnlockableTokens(owner);
    expect(unlockableToken).to.be.bignumber.equal(tokensLocked);
    await giv.unlock(owner);
    unlockableToken = await giv.getUnlockableTokens(owner);
    assert.equal(0, unlockableToken.toNumber());
    const newBalance = await giv.balanceOf(owner);
    const validBalance = web3.utils.toBN(balance.toString()).add(web3.utils.toBN(tokensLocked.toString()));
    expect(newBalance).to.be.bignumber.equal(validBalance);
    await giv.unlock(owner);
    const newNewBalance = await giv.balanceOf(owner);
    expect(newBalance).to.be.bignumber.equal(newNewBalance);
  });

  it('should allow to lock token again', async () => {
    giv.lock('0x41', ether('1'), 0);
    await giv.unlock(owner);
    giv.lock('0x41', ether('1'), 0);
  });

  it('can transferWithLock', async () => {
    const accountBalance = await giv.balanceOf(account);
    const receiverBalance = await giv.balanceOf(receiver);
    const transferAmount = ether('600');

    await giv.addWhitelisted(receiver, { from: owner });
    await giv.transferWithLock(account, lockReason3, transferAmount, 180, { from: receiver });
    await expectRevert(giv.transferWithLock(account, lockReason3, receiverBalance, lockPeriod, { from: receiver }), 'Tokens already locked');

    const locked = await giv.locked(account, lockReason3);
    const accountTotalBalance = await giv.totalBalanceOf(account);
    const receiverTotalBalance = await giv.totalBalanceOf(receiver);
    const validAccountBalance = web3.utils.toBN(accountBalance).add(web3.utils.toBN(transferAmount));
    const validReceiverBalance = web3.utils.toBN(receiverBalance).sub(web3.utils.toBN(transferAmount));
    expect(accountTotalBalance).to.be.bignumber.equal(validAccountBalance);
    expect(receiverTotalBalance).to.be.bignumber.equal(validReceiverBalance);
    expect(locked[0]).to.be.bignumber.equal(transferAmount);
  });

  it('should not allow 0 lock amount', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    const lockTimestamp = await web3.eth.getBlock(blockNumber);

    await expectRevert(giv.lock('0x414141', 0, lockTimestamp.timestamp), 'Amount can not be 0');
    await expectRevert(giv.transferWithLock(account, '0x414141', 0, lockPeriod), 'Amount can not be 0');
  });

  it('should show 0 lock amount for unknown reasons', async () => {
    const actualLockedAmount = await giv.tokensLocked(owner, '0x4141');
    assert.equal(actualLockedAmount.toNumber(), 0);
  });

  it('should not allow to increase lock amount by more than balance', async () => {
    const balance = await giv.balanceOf(owner);
    const newBalance = web3.utils.toBN(balance).add(web3.utils.toBN(ether('1')));

    await expectRevert(giv.increaseLockAmount(lockReason, newBalance), 'No tokens locked');
  });

  it('should not allow to transfer and lock more than balance', async () => {
    const balance = await giv.balanceOf(owner);
    const newBalance = web3.utils.toBN(balance).add(web3.utils.toBN(ether('1')));

    await expectRevert(giv.transferWithLock(account, '0x4142', newBalance, lockPeriod), 'ERC20: transfer amount exceeds balance');
  });

  it('should allow transfer with lock again after claiming', async () => {
    const reLockAmount = ether('800');
    await increaseTime(180);
    await giv.unlock(account);
    await giv.transferWithLock(account, lockReason3, reLockAmount, 180);
    const accountBalance = await giv.balanceOf(account);
    const accountTotalBalance = await giv.totalBalanceOf(account);
    const validAccountBalance = web3.utils.toBN(accountBalance).add(web3.utils.toBN(reLockAmount));
    expect(accountTotalBalance).to.be.bignumber.equal(validAccountBalance);
  });

  it('can burn the amount of owner', async () => {
    const balance = await giv.balanceOf(owner);
    const burnAmount = ether('300');
    await giv.approve(owner, burnAmount);
    await giv.burnFrom(owner, burnAmount);
    const newBalance = await giv.balanceOf(owner);
    const validBalance = web3.utils.toBN(newBalance).add(web3.utils.toBN(burnAmount));
    expect(balance).to.be.bignumber.equal(validBalance);
  });

  it('can mint the token', async () => {
    const balance = await giv.balanceOf(owner);
    const mintAmount = ether('300');
    await giv.mint(owner, mintAmount);
    const newBalance = await giv.balanceOf(owner);
    const validBalance = web3.utils.toBN(balance).add(web3.utils.toBN(mintAmount));
    expect(newBalance).to.be.bignumber.equal(validBalance);
  });

  it('can remove whitelisted role', async () => {
    const transferAmount = ether('600');
    await giv.removeWhitelisted(receiver, { from: owner });
    await expectRevert(giv.transferWithLock(account, lockReason3, transferAmount, 180, { from: receiver }), 'WhitelistedRole: caller does not have the Whitelisted role');
  });
});
