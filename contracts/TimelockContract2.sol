
pragma solidity 0.5.9;

// Sovcube TimeLock, & Slow Release & Send Timelocked Tokens Contract
// https://SovCube.com
// 
//
// DO NOT SEND TOKENS DIRECTLY TO THIS CONTRACT!!!
// THEY WILL BE LOST FOREVER!!!
// YOU HAVE TO MAKE A CALL TO THE CONTRACT TO BE ABLE TO TIMELOCK & WITHDRAW!!!
//
// This contract timelocks BSOV Tokens for 1000 days from the day the contract is deployed.
// Tokens can be timelocked within that period without resetting the timer.
// The timelocked tokens will be sent to the user's "Regular Account"
//
// Once the users have timelocked their tokens, they are able to send timelocked tokens to anyone,
// they can even batch several addresses and amounts into one "Send Timelocked Tokens" transaction. 
// If you receive timelocked tokens from someone, they will be sent to your "Untaken Incoming Balance".
// If you accept the incoming tokens using the "acceptIncomingTokens" method, the Lock Time of your Incoming Tokens Account will reset to 1000 days.
//
// After the desired date is reached, users can withdraw tokens with a rate limit to prevent all holders
// from withdrawing and selling at the same time. The limit is 100 BSoV per week per user once the 1000 days is hit.

library SafeMath {
    function add(uint a, uint b) internal pure returns(uint c) {
        c = a + b;
        require(c >= a);
    }
    function sub(uint a, uint b) internal pure returns(uint c) {
        require(b <= a);
        c = a - b;
    }
    function mul(uint a, uint b) internal pure returns(uint c) {
        c = a * b;
        require(a == 0 || c / a == b);
    }
    function div(uint a, uint b) internal pure returns(uint c) {
        require(b > 0);
        c = a / b;
    }
}

contract ERC20Interface {
    function totalSupply() public view returns(uint);
    function balanceOf(address tokenOwner) public view returns(uint balance);
    function allowance(address tokenOwner, address spender) public view returns(uint remaining);
    function transfer(address to, uint tokens) public returns(bool success);
    function approve(address spender, uint tokens) public returns(bool success);
    function transferFrom(address from, address to, uint tokens) public returns(bool success);
    event Transfer(address indexed from, address indexed to, uint tokens);
    event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
}
interface ITimelockRewardReserve {
    function updateEligibility(address user, uint256 amount) external;
}


contract TimelockContract2 {
    address owner;
    using SafeMath for uint;

    struct incomingTimelockStruct {
    uint256 amount;
    uint256 newLockTime;
    address from;
    bool isPending;
}

    address constant tokenContract = 0x240E059d1B46159d74f103ab7dC63c0478DEE8Dc; // The BSOV Token contract

    address public timelockRewardReserveAddress;
    ITimelockRewardReserve timelockRewardReserve;
    uint constant PRECISION = 100000000;
    uint constant timeUntilUnlocked = 1000 days;            // All tokens locked for 1000 days after contract creation.
    uint constant maxWithdrawalAmount = 100 * PRECISION;  // Max withdrawal of 100 tokens per week per user once 1000 days is hit.
    uint constant timeBetweenWithdrawals = 7 days;        // Time between withdrawals
    uint constant resetIncomingAccountTimeLeft = 1000 days; // When Untaken Incoming Tokens are accepted, the Lock Time of the Incoming Account Balance will reset to 1000 days.
    uint unfreezeDate;
    mapping (address => uint) incomingAccountBalance;
    mapping (address => uint) incomingAccountLockExpiration;
	mapping (address => uint) balance;
	mapping (address => uint) lastWithdrawal;
    mapping (address => uint) lastIncomingAccountWithdrawal;
    mapping(address => incomingTimelockStruct) public pendingIncoming;
    event sendTimelockedMarked(address indexed from, address indexed to, uint256 amount);
    event TokensClaimed(address indexed to, uint256 amount);
    
    event TokensFrozen (
        address indexed addr,
        uint256 amt,
        uint256 time
	);

    event TokensUnfrozen (
        address indexed addr,
        uint256 amt,
        uint256 time
	);

    constructor() public {
        owner = msg.sender;
        unfreezeDate = now + timeUntilUnlocked;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

// This function sets the Timelock Reward Reserve contract's address. Can only be done by owner.
function setTimelockRewardReserveAddress(address _address) public onlyOwner {
    timelockRewardReserveAddress = _address;
    timelockRewardReserve = ITimelockRewardReserve(timelockRewardReserveAddress);
}

// This function sends timelocked tokens to one or several addresses' "Untaken Incoming Balance".
function markTimelockedTokensForSend(address[] memory _receivers, uint[] memory _amounts) public {
    require(_receivers.length == _amounts.length, "Mismatched array lengths");

    uint totalAmount = 0;
    for (uint i = 0; i < _amounts.length; i++) {
        totalAmount += _amounts[i];
    }

    require(balance[msg.sender] >= totalAmount, "Insufficient timelocked balance. You have to timelock tokens before sending timelocked tokens.");

    for (uint i = 0; i < _receivers.length; i++) {
        address receiver = _receivers[i];
        uint amount = _amounts[i];
        
        pendingIncoming[receiver].amount += amount;
        pendingIncoming[receiver].from = msg.sender;
        pendingIncoming[receiver].isPending = true;

        emit sendTimelockedMarked(msg.sender, receiver, amount);
    }
    balance[msg.sender] -= totalAmount;
}

// This function accepts Untaken Incoming Balance - the Lock Time will reset for the Incoming Tokens Account.
function acceptIncomingTokens() public {
    require(pendingIncoming[msg.sender].isPending, "You have no Incoming Tokens to accept!");
    incomingTimelockStruct memory incomingTokens = pendingIncoming[msg.sender];
    incomingAccountBalance[msg.sender] += incomingTokens.amount; 
    incomingAccountLockExpiration[msg.sender] = now + resetIncomingAccountTimeLeft; // When Incoming Tokens are accepted, the unlock date resets to the days specified in resetIncomingAccountTimeLeft.
    delete pendingIncoming[msg.sender]; 
    emit TokensClaimed(msg.sender, incomingTokens.amount);
}

// This function withdraws timelocked tokens once the Lock Time has expired. You can choose which account you want to withdraw from.
function withdraw(uint _amount, bool fromIncomingTokensAccount) public {
    require(_amount > 0, "Withdraw amount must be greater than zero");
    uint256 balanceToCheck = fromIncomingTokensAccount ? incomingAccountBalance[msg.sender] : balance[msg.sender];
    uint256 lockExpiration = fromIncomingTokensAccount ? incomingAccountLockExpiration[msg.sender] : unfreezeDate;
    require(now >= lockExpiration, "Tokens are locked!");
    require(balanceToCheck >= _amount, "Insufficient timelocked balance for withdrawal");    

    require(_amount <= maxWithdrawalAmount, "Exceeds max withdrawal amount");

    if (fromIncomingTokensAccount) {
        require(now >= lastIncomingAccountWithdrawal[msg.sender] + timeBetweenWithdrawals, "Trying to withdraw too frequently!");
        incomingAccountBalance[msg.sender] -= _amount;
        lastIncomingAccountWithdrawal[msg.sender] = now;
    } else {
        require(now >= lastWithdrawal[msg.sender] + timeBetweenWithdrawals, "Trying to withdraw too frequently!");
        balance[msg.sender] -= _amount;
        lastWithdrawal[msg.sender] = now;
    }

    require(ERC20Interface(tokenContract).transfer(msg.sender, _amount), "Withdrawal: Transfer failed");
    emit TokensUnfrozen(msg.sender, _amount, now);
}

// This function gets the balance of the regular account.
    function getBalance(address _addr) public view returns (uint256 _balance) {
        return balance[_addr];
    }

// This function gets the time (seconds) since the last withdrawal from the Incoming Tokens Account
function getLastIncomingAccountWithdrawal(address _addr) public view returns (uint256 _lastWithdrawalTime) {
    return lastIncomingAccountWithdrawal[_addr];
}

// This function gets the time (in seconds) since the last withdrawal from the Regular Account
    function getLastWithdrawal(address _addr) public view returns (uint256 _lastWithdrawal) {
        return lastWithdrawal[_addr];
    }
   
// This function gets the time left (in seconds) of the Lock Time of the Regular Account   
    function getTimeLeft() public view returns (uint256 _timeLeft) {
        require(unfreezeDate > now, "Tokens are unlocked and ready for withdrawal");
        return unfreezeDate - now;
    } 
// This function gets the time left (in seconds) of the Lock Time of the Incoming Tokens Account
    function getIncomingAccountTimeLeft(address _addr) public view returns (uint256 _timeLeft) {
    if (incomingAccountLockExpiration[_addr] <= now) {
        return 0; // Tokens are already unlocked
    } else {
        return incomingAccountLockExpiration[_addr] - now;
    }
}

// This function gets the balance of the Untaken Incoming Tokens
function getUntakenIncomingBalance(address _user) public view returns (uint256) {
    if(pendingIncoming[_user].isPending) {
        return pendingIncoming[_user].amount;
    } else {
        return 0;
    }
}

// This function gets the balance of the Incoming Tokens Account
function getIncomingAccountBalance(address _addr) public view returns (uint256 _balance) {
    return incomingAccountBalance[_addr];
}

    function receiveApproval(address _sender, uint256 _value, address _tokenContract, bytes memory _extraData) public {
        require(_tokenContract == tokenContract, "Can only deposit BSOV into this contract!");
        require(_value > 100, "Value must be greater than 100 Mundos, (0.00000100 BSOV)");
        require(ERC20Interface(tokenContract).transferFrom(_sender, address(this), _value), "Timelocking transaction failed");

        uint _adjustedValue = _value.mul(99).div(100);
        balance[_sender] += _adjustedValue;
        emit TokensFrozen(_sender, _adjustedValue, now);
        if (_sender != timelockRewardReserveAddress) {
        if (timelockRewardReserveAddress != address(0)) {
        timelockRewardReserve.updateEligibility(_sender, _adjustedValue);
     }
  }
    }
    
}
