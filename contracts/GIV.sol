pragma solidity ^0.5.6;

import '../node_modules/@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol';
import '../node_modules/@openzeppelin/contracts/token/ERC20/ERC20Pausable.sol';
import '../node_modules/@openzeppelin/contracts/access/roles/WhitelistedRole.sol';

import './ERC1132.sol';

/// @title GIV - ERC20 token. Utility coin
/// @notice Implementation for the ERC-1132 lockable token
contract GIV is ERC1132, ERC20Detailed, ERC20Pausable, WhitelistedRole {

  /**
    * @dev Error messages for require statements
    */
    string internal constant ALREADY_LOCKED = 'Tokens already locked';
    string internal constant NOT_LOCKED = 'No tokens locked';
    string internal constant AMOUNT_ZERO = 'Amount can not be 0';

  /**
    * @dev Token issue information
    */
    string private NAME = 'SDPlatform GIV Token';
    string private SYMBOL = 'GIV';
    uint8 private DECIMALS = 18;
    uint256 private INITIAL_SUPPLY = 3500000000;

    constructor() public ERC20Detailed(NAME, SYMBOL, DECIMALS) {
        _mint(msg.sender, INITIAL_SUPPLY * (10 ** uint(DECIMALS)));
        _addWhitelisted(msg.sender);
    }

    /// @notice Mints amount of GIV on account
    /// Can be used only by whitelist
    function mint(address _account, uint256 _amount) external
    whenNotPaused onlyWhitelisted {
        _mint(_account, _amount);
    }

    /// @notice Burns amount of GIV from account and removes
    /// allowance for this amount
    /// Can be used only by whitelist
    function burnFrom(address _account, uint256 _amount) external
    whenNotPaused onlyWhitelisted {
        _burnFrom(_account, _amount);
    }

    // @notice Add Whitelisted Role of GIV on account
    /// Can be used only by whitelist
    function addWhitelisted(address _account) public
    whenNotPaused onlyWhitelistAdmin {
        _addWhitelisted(_account);
    }

    // @notice Remove Whitelisted Role of GIV on account
    /// Can be used only by whitelist
    function removeWhitelisted(address _account) public
    whenNotPaused onlyWhitelistAdmin {
        _removeWhitelisted(_account);
    }

    /**
     * @dev Locks a specified amount of tokens against an address,
     *      for a specified reason and time
     * @param _reason The reason to lock tokens
     * @param _amount Number of tokens to be locked
     * @param _time Lock time in seconds
     */
    function lock(bytes32 _reason, uint256 _amount, uint256 _time) public
    whenNotPaused onlyWhitelisted returns (bool) {
        uint256 validUntil = now.add(_time);

        // If tokens are already locked, then functions extendLock or
        // increaseLockAmount should be used to make any changes
        require(tokensLocked(msg.sender, _reason) == 0, ALREADY_LOCKED);
        require(_amount != 0, AMOUNT_ZERO);

        if (locked[msg.sender][_reason].amount == 0)
            lockReason[msg.sender].push(_reason);

        transfer(address(this), _amount);

        locked[msg.sender][_reason] = lockToken(_amount, validUntil, false);

        emit Locked(msg.sender, _reason, _amount, validUntil);
        return true;
    }

    /**
     * @dev Transfers and Locks a specified amount of tokens,
     *      for a specified reason and time
     * @param _to adress to which tokens are to be transfered
     * @param _reason The reason to lock tokens
     * @param _amount Number of tokens to be transfered and locked
     * @param _time Lock time in seconds
     */
    function transferWithLock(address _to, bytes32 _reason, uint256 _amount, uint256 _time) public
    whenNotPaused onlyWhitelisted returns (bool) {
        uint256 validUntil = now.add(_time);

        require(tokensLocked(_to, _reason) == 0, ALREADY_LOCKED);
        require(_amount != 0, AMOUNT_ZERO);

        if (locked[_to][_reason].amount == 0)
            lockReason[_to].push(_reason);

        transfer(address(this), _amount);

        locked[_to][_reason] = lockToken(_amount, validUntil, false);

        emit Locked(_to, _reason, _amount, validUntil);
        return true;
    }

    /**
     * @dev Returns tokens locked for a specified address for a
     *      specified reason
     *
     * @param _of The address whose tokens are locked
     * @param _reason The reason to query the lock tokens for
     */
    function tokensLocked(address _of, bytes32 _reason) public view
    whenNotPaused onlyWhitelisted returns (uint256 amount) {
        if (!locked[_of][_reason].claimed)
            amount = locked[_of][_reason].amount;
    }

    /**
     * @dev Returns tokens locked for a specified address for a
     *      specified reason at a specific time
     *
     * @param _of The address whose tokens are locked
     * @param _reason The reason to query the lock tokens for
     * @param _time The timestamp to query the lock tokens for
     */
    function tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time) public view
    whenNotPaused onlyWhitelisted returns (uint256 amount) {
        if (locked[_of][_reason].validity > _time)
            amount = locked[_of][_reason].amount;
    }

    /**
     * @dev Returns total tokens held by an address (locked + transferable)
     * @param _of The address to query the total balance of
     */
    function totalBalanceOf(address _of) public view
    whenNotPaused onlyWhitelisted returns (uint256 amount) {
        amount = balanceOf(_of);

        for (uint256 i = 0; i < lockReason[_of].length; i++) {
            amount = amount.add(tokensLocked(_of, lockReason[_of][i]));
        }
    }

    /**
     * @dev Extends lock for a specified reason and time
     * @param _reason The reason to lock tokens
     * @param _time Lock extension time in seconds
     */
    function extendLock(bytes32 _reason, uint256 _time) public
    whenNotPaused onlyWhitelisted returns (bool) {
        require(tokensLocked(msg.sender, _reason) > 0, NOT_LOCKED);

        locked[msg.sender][_reason].validity = locked[msg.sender][_reason].validity.add(_time);

        emit Locked(msg.sender, _reason, locked[msg.sender][_reason].amount, locked[msg.sender][_reason].validity);
        return true;
    }

    /**
     * @dev Increase number of tokens locked for a specified reason
     * @param _reason The reason to lock tokens
     * @param _amount Number of tokens to be increased
     */
    function increaseLockAmount(bytes32 _reason, uint256 _amount) public
    whenNotPaused onlyWhitelisted returns (bool) {
        require(tokensLocked(msg.sender, _reason) > 0, NOT_LOCKED);
        transfer(address(this), _amount);

        locked[msg.sender][_reason].amount = locked[msg.sender][_reason].amount.add(_amount);

        emit Locked(msg.sender, _reason, locked[msg.sender][_reason].amount, locked[msg.sender][_reason].validity);
        return true;
    }

    /**
     * @dev Returns unlockable tokens for a specified address for a specified reason
     * @param _of The address to query the the unlockable token count of
     * @param _reason The reason to query the unlockable tokens for
     */
    function tokensUnlockable(address _of, bytes32 _reason) public view
    whenNotPaused onlyWhitelisted returns (uint256 amount) {
        if (locked[_of][_reason].validity <= now && !locked[_of][_reason].claimed)
            amount = locked[_of][_reason].amount;
    }

    /**
     * @dev Unlocks the unlockable tokens of a specified address
     * @param _of Address of user, claiming back unlockable tokens
     */
    function unlock(address _of) public
    whenNotPaused onlyWhitelisted returns (uint256 unlockableTokens) {
        uint256 lockedTokens;

        for (uint256 i = 0; i < lockReason[_of].length; i++) {
            lockedTokens = tokensUnlockable(_of, lockReason[_of][i]);
            if (lockedTokens > 0) {
                unlockableTokens = unlockableTokens.add(lockedTokens);
                locked[_of][lockReason[_of][i]].claimed = true;
                emit Unlocked(_of, lockReason[_of][i], lockedTokens);
            }
        }

        if (unlockableTokens > 0)
            this.transfer(_of, unlockableTokens);
    }

    /**
     * @dev Gets the unlockable tokens of a specified address
     * @param _of The address to query the the unlockable token count of
     */
    function getUnlockableTokens(address _of) public view
    whenNotPaused onlyWhitelisted returns (uint256 unlockableTokens) {
        uint256 lockedTokens;

        for (uint256 i = 0; i < lockReason[_of].length; i++) {
            lockedTokens = tokensUnlockable(_of, lockReason[_of][i]);
            unlockableTokens = unlockableTokens.add(lockedTokens);
        }
    }
}